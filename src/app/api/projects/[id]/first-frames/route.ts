import { createRouteClient } from "@/lib/supabase-route";
import {
  generateFirstFrame,
  ReferenceImageUnreachableError,
} from "@/lib/generate-image";
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

  const [panelsRes, framesRes] = await Promise.all([
    supabase
      .from("storyboard_panels")
      .select(
        "id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, dialogue, characters_in_shot, duration_seconds, approved_first_frame_id"
      )
      .eq("project_id", id)
      .order("panel_number", { ascending: true }),
    supabase
      .from("first_frames")
      .select("id, panel_id, status, aspect_ratio, model_used, parent_frame_id, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (panelsRes.error) {
    return NextResponse.json({ error: panelsRes.error.message }, { status: 500 });
  }

  const framesByPanel: Record<string, typeof framesRes.data> = {};
  for (const f of framesRes.data || []) {
    if (!framesByPanel[f.panel_id]) framesByPanel[f.panel_id] = [];
    framesByPanel[f.panel_id]!.push(f);
  }

  const panels = (panelsRes.data || []).map((p) => ({
    ...p,
    frames: framesByPanel[p.id] || [],
  }));

  return NextResponse.json({ panels });
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
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Project-level context (production notes + phase advance)
  const { data: projectRow } = await supabase
    .from("projects")
    .select("production_notes, phase_status")
    .eq("id", id)
    .single();
  const productionNotes: string = projectRow?.production_notes || "";

  // Pull panels to generate for
  let panelsQuery = supabase
    .from("storyboard_panels")
    .select(
      "id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, characters_in_shot, approved_first_frame_id"
    )
    .eq("project_id", id)
    .order("panel_number", { ascending: true });
  if (singlePanelId) {
    panelsQuery = panelsQuery.eq("id", singlePanelId);
  }
  const { data: panels, error: panelErr } = await panelsQuery;
  if (panelErr || !panels || panels.length === 0) {
    return NextResponse.json({ error: "No storyboard panels found" }, { status: 400 });
  }

  // Scenes (for location/time_of_day/mood + approved_scout_image_url)
  const sceneIds = Array.from(new Set(panels.map((p) => p.scene_id)));
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, location, time_of_day, mood, approved_scout_image_url")
    .in("id", sceneIds);
  const sceneById: Record<string, (typeof scenes extends Array<infer T> ? T : never)> = {};
  for (const s of scenes || []) sceneById[s.id] = s;

  // Characters (name → approved headshot URL). Only used for characters in any shot.
  const allCharNames = new Set<string>();
  for (const p of panels) for (const name of p.characters_in_shot || []) allCharNames.add(name);

  const headshotByName: Record<string, string | null> = {};
  if (allCharNames.size > 0) {
    // We need each character's approved cast variation image_url
    const { data: chars } = await supabase
      .from("characters")
      .select("id, name, approved_cast_id, voice_only")
      .eq("project_id", id);
    const charsByName: Record<string, { id: string; approved_cast_id: string | null; voice_only: boolean }> = {};
    for (const c of chars || []) charsByName[c.name] = c;

    const castIds = (chars || [])
      .filter((c) => c.approved_cast_id && !c.voice_only)
      .map((c) => c.approved_cast_id as string);

    if (castIds.length > 0) {
      const { data: variations } = await supabase
        .from("cast_variations")
        .select("id, image_url")
        .in("id", castIds);
      const urlByCastId: Record<string, string> = {};
      for (const v of variations || []) urlByCastId[v.id] = v.image_url;
      for (const name of allCharNames) {
        const c = charsByName[name];
        if (c && c.approved_cast_id && !c.voice_only) {
          headshotByName[name] = urlByCastId[c.approved_cast_id] || null;
        } else {
          headshotByName[name] = null;
        }
      }
    }
  }

  let framesGenerated = 0;
  const errors: string[] = [];

  for (const panel of panels) {
    // Skip panels that already have an approved frame when running bulk
    if (!singlePanelId && panel.approved_first_frame_id) continue;

    const scene = sceneById[panel.scene_id];
    if (!scene) {
      errors.push(`Panel ${panel.panel_number}: parent scene not found`);
      continue;
    }

    const characterReferences = (panel.characters_in_shot || [])
      .map((name: string) => {
        const url = headshotByName[name];
        return url ? { name, imageUrl: url } : null;
      })
      .filter((x): x is { name: string; imageUrl: string } => x !== null);

    try {
      const result = await generateFirstFrame({
        panelNumber: panel.panel_number,
        actionDescription: panel.action_description || "",
        shotType: panel.shot_type || "",
        cameraAngle: panel.camera_angle || "",
        cameraMovement: panel.camera_movement || "",
        characterReferences,
        sceneReferenceImageUrl: scene.approved_scout_image_url || null,
        locationName: scene.location || "",
        timeOfDay: scene.time_of_day || "",
        mood: scene.mood || "",
        productionNotes,
        aspectRatio: "16:9",
      });

      const { data: inserted, error: insertErr } = await supabase
        .from("first_frames")
        .insert({
          project_id: id,
          panel_id: panel.id,
          image_url: result.url,
          prompt_used: result.prompt,
          aspect_ratio: "16:9",
          status: "pending",
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        errors.push(`Panel ${panel.panel_number}: insert failed — ${insertErr?.message || "no row"}`);
        continue;
      }

      framesGenerated++;
    } catch (err) {
      const msg =
        err instanceof ReferenceImageUnreachableError
          ? `reference unreachable (${err.message})`
          : err instanceof Error
          ? err.message
          : String(err);
      console.error(`First frame panel ${panel.panel_number} failed:`, msg);
      errors.push(`Panel ${panel.panel_number}: ${msg}`);
    }
  }

  // Advance phase to first_frames on bulk runs if any frames landed
  if (!singlePanelId && framesGenerated > 0 && projectRow?.phase_status !== "first_frames") {
    await supabase
      .from("projects")
      .update({ phase_status: "first_frames" })
      .eq("id", id);
  }

  return NextResponse.json({
    success: true,
    framesGenerated,
    panelsProcessed: panels.length,
    errors,
  });
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

  return NextResponse.json({ success: true, frame_id, panel_id: frame.panel_id });
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
      aspect_ratio: "16:9",
      status: "approved",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message || "Insert failed" }, { status: 500 });
  }

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

  return NextResponse.json({ success: true, frame_id: inserted.id, panel_id });
}
