import { createRouteClient } from "@/lib/supabase-route";
import { generateProjectFirstFrames } from "@/lib/first-frame-generation";
import { recordProvenance } from "@/lib/provenance";
import { normalizeProjectAspectRatio } from "@/lib/types";
import { evaluateProjectAutomation, recordProjectDecision } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ──────────────────────────────────────────────────────────────
// GET /api/projects/:id/first-frames
// Metadata only (NO image_url in bulk — lazy-load via /image endpoint).
// Returns frames grouped by panel, with the currently-approved frame
// identified by the panel's approved_first_frame_id.
// ──────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [panelsRes, framesRes, scenesRes, projectRes] = await Promise.all([
    supabase
      .from("storyboard_panels")
      .select(
        "id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, dialogue, characters_in_shot, duration_seconds, approved_first_frame_id, aspect_ratio"
      )
      .eq("project_id", id)
      .order("panel_number", { ascending: true }),
    supabase
      .from("first_frames")
      .select("id, panel_id, status, aspect_ratio, model_used, parent_frame_id, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    // Scene metadata so the UI can show "Scene N · Panel NN · Location" on
    // each card — otherwise 30 panels across 5 scenes are indistinguishable.
    supabase
      .from("scenes")
      .select("id, scene_number, location, time_of_day, mood")
      .eq("project_id", id),
    supabase
      .from("projects")
      .select("aspect_ratio")
      .eq("id", id)
      .single(),
  ]);

  if (panelsRes.error) {
    return NextResponse.json({ error: panelsRes.error.message }, { status: 500 });
  }

  const framesByPanel: Record<string, typeof framesRes.data> = {};
  for (const f of framesRes.data || []) {
    if (!framesByPanel[f.panel_id]) framesByPanel[f.panel_id] = [];
    framesByPanel[f.panel_id]!.push(f);
  }

  const sceneById: Record<
    string,
    { scene_number: number; location: string; time_of_day: string; mood: string }
  > = {};
  for (const s of scenesRes.data || []) {
    sceneById[s.id] = {
      scene_number: s.scene_number,
      location: s.location || "",
      time_of_day: s.time_of_day || "",
      mood: s.mood || "",
    };
  }

  const panels = (panelsRes.data || []).map((p) => ({
    ...p,
    frames: framesByPanel[p.id] || [],
    scene: sceneById[p.scene_id] || null,
  }));

  // Sort panels: scene_number asc, then panel_number asc
  panels.sort((a, b) => {
    const sa = a.scene?.scene_number ?? 9999;
    const sb = b.scene?.scene_number ?? 9999;
    if (sa !== sb) return sa - sb;
    return a.panel_number - b.panel_number;
  });

  return NextResponse.json({
    panels,
    project: {
      aspect_ratio: normalizeProjectAspectRatio(projectRes.data?.aspect_ratio),
    },
  });
}

// ──────────────────────────────────────────────────────────────
// POST /api/projects/:id/first-frames
// Body: { panel_id?: string }  — if provided, generate one frame for that
// panel; otherwise generate for every panel that doesn't yet have an
// approved frame. Sequential to stay under the 300s function timeout.
// ──────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const singlePanelId = body.panel_id as string | undefined;
  // Realism-gate regeneration: anti-illustration addendum from the failed
  // attempt's scored issues (diagnostic v3)
  const feedbackNote = (body.feedback_note as string | undefined) || undefined;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await generateProjectFirstFrames(supabase, id, { panelId: singlePanelId, feedbackNote });
  const failedCompletely = result.framesGenerated === 0 && result.errors.length > 0;
  return NextResponse.json(
    {
      success: !failedCompletely,
      framesGenerated: result.framesGenerated,
      panelsProcessed: result.panelsProcessed,
      errors: result.errors,
    },
    { status: failedCompletely ? 500 : 200 }
  );
}

// ──────────────────────────────────────────────────────────────
// PATCH /api/projects/:id/first-frames
// Body: { frame_id: string, status: "approved" }
// Marks a frame approved and stamps storyboard_panels.approved_first_frame_id.
// Any previously-approved frame for the same panel flips to "replaced".
// ──────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { frame_id, status } = body as { frame_id?: string; status?: string };
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!frame_id || status !== "approved") {
    return NextResponse.json(
      { error: "frame_id and status: 'approved' required" },
      { status: 400 }
    );
  }

  // Load the frame (need panel_id)
  const { data: frame, error: frameErr } = await supabase
    .from("first_frames")
    .select("id, panel_id, project_id")
    .eq("id", frame_id)
    .eq("project_id", id)
    .single();
  if (frameErr || !frame) {
    return NextResponse.json({ error: "Frame not found" }, { status: 404 });
  }

  // Flip any prior approved frame for this panel → replaced
  await supabase
    .from("first_frames")
    .update({ status: "replaced" })
    .eq("panel_id", frame.panel_id)
    .eq("status", "approved");

  // Approve this one
  await supabase
    .from("first_frames")
    .update({ status: "approved" })
    .eq("id", frame_id);

  // Stamp the panel
  await supabase
    .from("storyboard_panels")
    .update({ approved_first_frame_id: frame_id })
    .eq("id", frame.panel_id);

  await recordProjectDecision(supabase, {
    projectId: id,
    decisionType: "first_frame",
    subjectType: "storyboard_panel",
    subjectId: frame.panel_id,
    status: "approved",
    metadata: { frame_id },
    user,
  });
  const automation = await evaluateProjectAutomation(supabase, id);

  return NextResponse.json({ success: true, frame_id, panel_id: frame.panel_id, automation });
}

// ──────────────────────────────────────────────────────────────
// PUT /api/projects/:id/first-frames
// Replace a frame with a user-uploaded image (same direct-Storage pattern
// as cast/posesheet upload). Body: { panel_id, image_url, storage_path }.
// Creates a new first_frames row and marks it approved.
// ──────────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { panel_id, image_url, storage_path } = body as {
    panel_id?: string;
    image_url?: string;
    storage_path?: string;
  };
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: projectRow } = await supabase
    .from("projects")
    .select("aspect_ratio")
    .eq("id", id)
    .single();
  const aspectRatio = normalizeProjectAspectRatio(projectRow?.aspect_ratio);

  if (!panel_id || !image_url || !storage_path) {
    return NextResponse.json(
      { error: "panel_id, image_url, storage_path required" },
      { status: 400 }
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("first_frames")
    .insert({
      project_id: id,
      panel_id,
      image_url,
      prompt_used: `[uploaded by user] ${storage_path}`,
      model_used: "user-upload",
      aspect_ratio: aspectRatio,
      status: "approved",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message || "Insert failed" }, { status: 500 });
  }

  await recordProvenance(supabase, {
    projectId: id,
    assetType: "first_frame",
    assetId: inserted.id,
    sources: [{ sourceType: "storyboard_panel", sourceId: panel_id, relationship: "uploaded_replacement" }],
    metadata: { storage_path, aspect_ratio: aspectRatio },
  });

  // Flip any prior approved to replaced
  await supabase
    .from("first_frames")
    .update({ status: "replaced" })
    .eq("panel_id", panel_id)
    .eq("status", "approved")
    .neq("id", inserted.id);

  // Stamp the panel
  await supabase
    .from("storyboard_panels")
    .update({ approved_first_frame_id: inserted.id })
    .eq("id", panel_id);

  await recordProjectDecision(supabase, {
    projectId: id,
    decisionType: "first_frame",
    subjectType: "storyboard_panel",
    subjectId: panel_id,
    status: "approved",
    metadata: { frame_id: inserted.id, source: "uploaded_replacement" },
    user,
  });
  const automation = await evaluateProjectAutomation(supabase, id);

  return NextResponse.json({ success: true, frame_id: inserted.id, panel_id, automation });
}
