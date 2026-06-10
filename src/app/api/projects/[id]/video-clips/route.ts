import { createRouteClient } from "@/lib/supabase-route";
import { generateVideoClip, buildMotionPrompt, selectVideoModel, VideoGenRequest } from "@/lib/generate-video";
import { recordProvenance } from "@/lib/provenance";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ──────────────────────────────────────────────────────────────
// GET /api/projects/:id/video-clips
// Clip metadata grouped by panel. video_url is a CDN URL (not base64)
// so it's safe in bulk.
// ──────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [clipsRes, panelsRes, scenesRes] = await Promise.all([
    supabase
      .from("video_clips")
      .select("id, panel_id, first_frame_id, higgsfield_job_id, status, video_url, duration_seconds, model_used, motion_description, retry_count, parent_clip_id, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("storyboard_panels")
      .select("id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, characters_in_shot, duration_seconds, approved_first_frame_id")
      .eq("project_id", id)
      .order("panel_number", { ascending: true }),
    supabase
      .from("scenes")
      .select("id, scene_number, location")
      .eq("project_id", id),
  ]);

  const sceneById: Record<string, { scene_number: number; location: string }> = {};
  for (const s of scenesRes.data || []) sceneById[s.id] = { scene_number: s.scene_number, location: s.location || "" };

  const clipsByPanel: Record<string, NonNullable<typeof clipsRes.data>> = {};
  for (const c of clipsRes.data || []) {
    if (!clipsByPanel[c.panel_id]) clipsByPanel[c.panel_id] = [];
    clipsByPanel[c.panel_id]!.push(c);
  }

  const panels = (panelsRes.data || [])
    .map((p) => ({
      ...p,
      scene: sceneById[p.scene_id] || null,
      clips: clipsByPanel[p.id] || [],
    }))
    .sort((a, b) => {
      const sa = a.scene?.scene_number ?? 9999;
      const sb = b.scene?.scene_number ?? 9999;
      if (sa !== sb) return sa - sb;
      return a.panel_number - b.panel_number;
    });

  return NextResponse.json({ panels });
}

// ──────────────────────────────────────────────────────────────
// POST /api/projects/:id/video-clips
// Body: { panel_id?: string, motion_prompt?: string }
// Single panel when panel_id given; bulk over panels lacking an
// approved/completed clip otherwise. Sequential; 300s maxDuration —
// callers (UI / orchestrator) drive one-panel-at-a-time loops.
// ──────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const singlePanelId = body.panel_id as string | undefined;
  const motionOverride = body.motion_prompt as string | undefined;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: projectRow } = await supabase
    .from("projects")
    .select("production_notes")
    .eq("id", id)
    .single();
  const productionNotes: string = projectRow?.production_notes || "";

  let panelsQuery = supabase
    .from("storyboard_panels")
    .select("id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, characters_in_shot, duration_seconds, approved_first_frame_id")
    .eq("project_id", id)
    .order("panel_number", { ascending: true });
  if (singlePanelId) panelsQuery = panelsQuery.eq("id", singlePanelId);
  const { data: panels, error: panelErr } = await panelsQuery;
  if (panelErr || !panels || panels.length === 0) {
    return NextResponse.json({ error: "No storyboard panels found" }, { status: 400 });
  }

  // Scene metadata for mood + scene_number
  const sceneIds = Array.from(new Set(panels.map((p) => p.scene_id)));
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, scene_number, mood")
    .in("id", sceneIds);
  const sceneById: Record<string, { scene_number: number; mood: string }> = {};
  for (const s of scenes || []) sceneById[s.id] = { scene_number: s.scene_number, mood: s.mood || "" };

  // Skip panels that already have a non-failed clip when running bulk
  const { data: existingClips } = await supabase
    .from("video_clips")
    .select("panel_id, status")
    .eq("project_id", id)
    .in("status", ["pending", "generating", "completed", "approved"]);
  const panelsWithClip = new Set((existingClips || []).map((c) => c.panel_id));

  let clipsCreated = 0;
  let clipsCompleted = 0;
  const errors: string[] = [];

  for (const panel of panels) {
    if (!singlePanelId && panelsWithClip.has(panel.id)) continue;

    if (!panel.approved_first_frame_id) {
      errors.push(`Panel ${panel.panel_number}: no approved first frame`);
      continue;
    }

    const { data: frame } = await supabase
      .from("first_frames")
      .select("id, image_url")
      .eq("id", panel.approved_first_frame_id)
      .single();
    if (!frame?.image_url) {
      errors.push(`Panel ${panel.panel_number}: approved first frame has no image`);
      continue;
    }

    const scene = sceneById[panel.scene_id] || { scene_number: 0, mood: "" };
    const genReq: VideoGenRequest = {
      panelNumber: panel.panel_number,
      sceneNumber: scene.scene_number,
      shotType: panel.shot_type || "",
      cameraAngle: panel.camera_angle || "",
      cameraMovement: panel.camera_movement || "",
      actionDescription: panel.action_description || "",
      mood: scene.mood,
      durationSeconds: Number(panel.duration_seconds) || 5,
      charactersInShot: panel.characters_in_shot || [],
      productionNotes,
    };

    const prompt = motionOverride || buildMotionPrompt(genReq);
    const model = selectVideoModel(genReq);

    // Data-URL first frames can't be sent to an external API by URL —
    // those clips go to MCP fulfillment (the connector uploads bytes).
    const isHttpFrame = frame.image_url.startsWith("http");
    const result =
      isHttpFrame && !motionOverride
        ? await generateVideoClip(frame.image_url, genReq)
        : isHttpFrame
        ? await generateVideoClip(frame.image_url, { ...genReq, actionDescription: motionOverride || genReq.actionDescription })
        : { status: "pending_external" as const, videoUrl: null, jobId: null, model, prompt };

    const { data: inserted, error: insertErr } = await supabase
      .from("video_clips")
      .insert({
        project_id: id,
        panel_id: panel.id,
        first_frame_id: frame.id,
        higgsfield_job_id: result.jobId,
        status: result.status === "completed" ? "completed" : result.status === "failed" ? "failed" : "pending",
        video_url: result.videoUrl,
        duration_seconds: genReq.durationSeconds,
        model_used: result.model,
        prompt_used: result.prompt,
        motion_description: `${genReq.cameraMovement || "static"} — ${genReq.actionDescription}`,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      errors.push(`Panel ${panel.panel_number}: insert failed — ${insertErr?.message}`);
      continue;
    }

    await recordProvenance(supabase, {
      projectId: id,
      assetType: "video_clip",
      assetId: inserted.id,
      sources: [
        { sourceType: "storyboard_panel", sourceId: panel.id, relationship: "video_motion" },
      ],
      metadata: { first_frame_id: frame.id, model: result.model },
    });

    clipsCreated++;
    if (result.status === "completed") clipsCompleted++;
    if (result.status === "failed" && result.error) {
      errors.push(`Panel ${panel.panel_number}: ${result.error}`);
    }
  }

  return NextResponse.json({
    success: true,
    clipsCreated,
    clipsCompleted,
    pendingExternal: clipsCreated - clipsCompleted,
    errors,
  });
}

// ──────────────────────────────────────────────────────────────
// PATCH /api/projects/:id/video-clips
// Two uses:
// 1. Approve: { clip_id, status: "approved" }
// 2. External fulfillment (MCP connector posts the finished video):
//    { clip_id, status: "completed", video_url, higgsfield_job_id? }
// ──────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { clip_id, status, video_url, higgsfield_job_id } = body as {
    clip_id?: string;
    status?: string;
    video_url?: string;
    higgsfield_job_id?: string;
  };
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!clip_id || !status) {
    return NextResponse.json({ error: "clip_id and status required" }, { status: 400 });
  }
  if (!["approved", "completed", "failed", "pending"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const update: Record<string, unknown> = { status };
  if (video_url !== undefined) update.video_url = video_url;
  if (higgsfield_job_id !== undefined) update.higgsfield_job_id = higgsfield_job_id;

  const { data, error } = await supabase
    .from("video_clips")
    .update(update)
    .eq("id", clip_id)
    .eq("project_id", id)
    .select("id, panel_id, status")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Clip not found" }, { status: 404 });
  }

  // Approving a clip demotes any previously-approved sibling on the same panel
  if (status === "approved") {
    await supabase
      .from("video_clips")
      .update({ status: "completed" })
      .eq("panel_id", data.panel_id)
      .eq("status", "approved")
      .neq("id", clip_id);
  }

  return NextResponse.json({ success: true, clip: data });
}
