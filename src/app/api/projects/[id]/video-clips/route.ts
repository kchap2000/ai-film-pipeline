import { createRouteClient } from "@/lib/supabase-route";
import { generateVideoClip, pollHiggsfieldJob, buildMotionPrompt, selectVideoModel, VideoGenRequest } from "@/lib/generate-video";
import { getWorldDirectives } from "@/lib/lessons";
import { buildSequencePrompt } from "@/lib/prompt-engine";
import { loadProjectElementRegistry } from "@/lib/element-keyframes";
import { recordProvenance } from "@/lib/provenance";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Multi-shot sequence grouping (PROMPTING.md): consecutive same-scene
// panels are generated as ONE Seedance clip with numbered Shot 1/2/3
// syntax — real cut rhythm inside the clip instead of disconnected
// 4-second beats. Caps per Seedance limits.
// Seedance 2.0 does true multi-shot in one generation (model card: multi-shot,
// consistent identity). The Higgsfield 2.0 guide + seedance-prompting skill run
// 5–6 numbered shots per 10–15s clip, so group up to 5 (still ≤15s) — fewer
// seams, more story flow per clip, while staying inside the model's sweet spot.
const MAX_SEQUENCE_SHOTS = 5;
const MAX_SEQUENCE_SECONDS = 15;

/**
 * Higgsfield's image2video input takes an image_url — it can't ingest our
 * base64 data-URL first frames (Gemini output stored in the DB). Upload
 * the bytes to the public project-uploads bucket once per frame and reuse
 * the public URL on regenerations.
 */
async function ensureHttpFrameUrl(
  supabase: SupabaseClient,
  projectId: string,
  frameId: string,
  imageUrl: string
): Promise<string | null> {
  if (imageUrl.startsWith("http")) return imageUrl;
  const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const [, mimeType, base64] = match;
  if (mimeType.includes("svg")) return null; // placeholder frames can't be animated
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const path = `video-frames/${projectId}/${frameId}.${ext}`;
  const bytes = Buffer.from(base64, "base64");
  const { error: upErr } = await supabase.storage
    .from("project-uploads")
    .upload(path, bytes, { contentType: mimeType, upsert: true });
  if (upErr) {
    console.error(`ensureHttpFrameUrl: upload failed for frame ${frameId}:`, upErr.message);
    return null;
  }
  const { data } = supabase.storage.from("project-uploads").getPublicUrl(path);
  return data.publicUrl || null;
}

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
  // revision_note: a director correction appended to the production
  // directive for THIS generation only (REVISION_VISION R3). Unlike
  // motion_prompt it does not replace the prompt or break sequence
  // grouping — it rides into buildMotionPrompt/buildSequencePrompt via
  // productionNotes.
  const revisionNote = body.revision_note as string | undefined;
  // no_group: force a single-shot clip even when neighbors could join
  // (used for QA regens of one flagged beat). replace: demote any active
  // clip that covers this panel before generating its replacement.
  const noGroup = body.no_group === true || !!motionOverride;
  const replaceCovering = body.replace === true;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: projectRow } = await supabase
    .from("projects")
    .select("production_notes")
    .eq("id", id)
    .single();
  // World rules + lessons flow into every video prompt's PRODUCTION
  // DIRECTIVE (learning system)
  const worldDirectives = await getWorldDirectives(supabase, id);
  const productionNotes: string = [
    projectRow?.production_notes || "",
    worldDirectives,
    revisionNote ? `REVISION DIRECTIVE (must be honored this take): ${revisionNote}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Always fetch ALL panels (ordered) — sequence grouping needs to look
  // ahead at a target panel's neighbors even in single-panel mode.
  const { data: allPanels, error: panelErr } = await supabase
    .from("storyboard_panels")
    .select("id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, dialogue, characters_in_shot, duration_seconds, approved_first_frame_id")
    .eq("project_id", id)
    .order("panel_number", { ascending: true });
  if (panelErr || !allPanels || allPanels.length === 0) {
    return NextResponse.json({ error: "No storyboard panels found" }, { status: 400 });
  }
  const panels = singlePanelId ? allPanels.filter((p) => p.id === singlePanelId) : allPanels;
  if (panels.length === 0) {
    return NextResponse.json({ error: "Panel not found" }, { status: 404 });
  }

  // Scene metadata: mood + scene_number + the scene's location name so we
  // can resolve the location's Higgsfield element for set consistency.
  const sceneIds = Array.from(new Set(panels.map((p) => p.scene_id)));
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, scene_number, mood, location")
    .in("id", sceneIds);
  const sceneById: Record<string, { scene_number: number; mood: string; location: string }> = {};
  for (const s of scenes || []) sceneById[s.id] = { scene_number: s.scene_number, mood: s.mood || "", location: s.location || "" };

  // Element registry: characters + locations carry their element ids
  // directly; project_elements adds props, outfits, and extra environments;
  // and (Track C1) any series-level library is merged in. Shared loader so
  // keyframes and clips lock identity/wardrobe/set the same way.
  const { registryElements, locationElementByName } = await loadProjectElementRegistry(supabase, id);

  const { data: projectAspect } = await supabase
    .from("projects")
    .select("aspect_ratio")
    .eq("id", id)
    .single();
  const aspectRatio: string = projectAspect?.aspect_ratio || "16:9";

  // Skip panels that already have a non-failed clip when running bulk —
  // including panels covered by a multi-shot sequence clip on a sibling.
  const { data: existingClips } = await supabase
    .from("video_clips")
    .select("id, panel_id, status, covered_panel_ids")
    .eq("project_id", id)
    .in("status", ["pending", "generating", "completed", "approved"]);
  const panelsWithClip = new Set((existingClips || []).map((c) => c.panel_id));
  for (const c of existingClips || []) {
    for (const covered of (c.covered_panel_ids as string[] | null) || []) panelsWithClip.add(covered);
  }

  // QA regen path: demote whatever active clip currently covers the target
  // panel BEFORE computing coverage, so the replacement sequence can
  // re-absorb the freed sibling panels.
  if (replaceCovering && singlePanelId) {
    const coveringClips = (existingClips || []).filter(
      (c) => c.panel_id === singlePanelId || ((c.covered_panel_ids as string[] | null) || []).includes(singlePanelId)
    );
    if (coveringClips.length > 0) {
      await supabase
        .from("video_clips")
        .update({ status: "replaced" })
        .in("id", coveringClips.map((c) => c.id));
      for (const c of coveringClips) {
        panelsWithClip.delete(c.panel_id);
        for (const cid of (c.covered_panel_ids as string[] | null) || []) panelsWithClip.delete(cid);
      }
    }
  }

  let clipsCreated = 0;
  let clipsCompleted = 0;
  const errors: string[] = [];

  for (const panel of panels) {
    if (!singlePanelId && panelsWithClip.has(panel.id)) continue;

    if (!panel.approved_first_frame_id) {
      errors.push(`Panel ${panel.panel_number}: no approved first frame`);
      continue;
    }

    // Resume path: if this panel already has a pending clip with a job id
    // (earlier submit timed out mid-poll), poll that job instead of
    // submitting a duplicate.
    if (singlePanelId) {
      const { data: pendingClip } = await supabase
        .from("video_clips")
        .select("id, higgsfield_job_id")
        .eq("panel_id", panel.id)
        .eq("status", "pending")
        .not("higgsfield_job_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (pendingClip?.higgsfield_job_id) {
        const polled = await pollHiggsfieldJob(pendingClip.higgsfield_job_id);
        if (polled.status === "completed") {
          await supabase
            .from("video_clips")
            .update({ status: "completed", video_url: polled.videoUrl })
            .eq("id", pendingClip.id);
          clipsCreated++;
          clipsCompleted++;
          continue;
        }
        if (polled.status === "failed") {
          await supabase.from("video_clips").update({ status: "failed" }).eq("id", pendingClip.id);
          errors.push(`Panel ${panel.panel_number}: resumed job failed — ${polled.error || "unknown"}`);
          continue;
        }
        // Still in progress — leave pending; caller can retry later.
        errors.push(`Panel ${panel.panel_number}: job still processing (id ${pendingClip.higgsfield_job_id})`);
        continue;
      }
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

    const scene = sceneById[panel.scene_id] || { scene_number: 0, mood: "", location: "" };
    // Set lock: exact location-name match, else substring match (handles
    // compound names like "Donna's Kitchen / Donna's Pool")
    const locKey = scene.location.toLowerCase().trim();
    const locationElementId =
      locationElementByName[locKey] ||
      Object.entries(locationElementByName).find(([name]) => name.includes(locKey) || locKey.includes(name))?.[1] ||
      null;

    // ── Sequence grouping: extend forward from this panel ─────
    // Take consecutive same-scene neighbors (panel_number + 1, +2) that
    // have approved frames and no active clip, until shot/second caps.
    const group = [panel];
    if (!noGroup) {
      const startIdx = allPanels.findIndex((p) => p.id === panel.id);
      let total = Number(panel.duration_seconds) || 5;
      for (let j = startIdx + 1; j < allPanels.length && group.length < MAX_SEQUENCE_SHOTS; j++) {
        const next = allPanels[j];
        const prev = group[group.length - 1];
        const nextDur = Number(next.duration_seconds) || 5;
        if (
          next.scene_id !== panel.scene_id ||
          next.panel_number !== prev.panel_number + 1 ||
          !next.approved_first_frame_id ||
          panelsWithClip.has(next.id) ||
          total + nextDur > MAX_SEQUENCE_SECONDS
        ) break;
        group.push(next);
        total += nextDur;
      }
    }
    const groupDuration = Math.min(
      MAX_SEQUENCE_SECONDS,
      group.reduce((s, p) => s + (Number(p.duration_seconds) || 5), 0)
    );
    const allCharacters = Array.from(new Set(group.flatMap((p) => p.characters_in_shot || [])));

    const genReq: VideoGenRequest = {
      panelNumber: panel.panel_number,
      sceneNumber: scene.scene_number,
      shotType: panel.shot_type || "",
      cameraAngle: panel.camera_angle || "",
      cameraMovement: panel.camera_movement || "",
      actionDescription: panel.action_description || "",
      mood: scene.mood,
      durationSeconds: groupDuration,
      charactersInShot: allCharacters,
      productionNotes,
      dialogue: panel.dialogue || "",
      registryElements,
      locationElementId,
      aspectRatio,
    };

    // Multi-shot groups get the numbered Shot 1/2/3 sequence prompt;
    // single panels keep the per-shot house prompt.
    const sequencePrompt =
      group.length > 1
        ? buildSequencePrompt(
            group.map((p) => ({
              shotType: p.shot_type || "Medium",
              cameraAngle: p.camera_angle || "",
              cameraMovement: p.camera_movement || "",
              actionDescription: p.action_description || "",
              dialogue: p.dialogue || "",
              durationSeconds: Number(p.duration_seconds) || undefined,
            })),
            {
              mood: scene.mood,
              durationSeconds: groupDuration,
              aspectRatio,
              productionNotes,
              elements: registryElements,
              locationElementId,
              charactersInShot: allCharacters,
            }
          )
        : undefined;

    const prompt = motionOverride || sequencePrompt || buildMotionPrompt(genReq);
    const model = selectVideoModel(genReq);

    // Higgsfield needs an HTTPS image URL — upload data-URL frames to the
    // public Storage bucket first. SVG placeholders can't be animated.
    const httpFrameUrl = await ensureHttpFrameUrl(supabase, id, frame.id, frame.image_url);
    const result = httpFrameUrl
      ? await generateVideoClip(
          httpFrameUrl,
          motionOverride ? { ...genReq, actionDescription: motionOverride } : genReq,
          motionOverride ? undefined : sequencePrompt
        )
      : { status: "failed" as const, videoUrl: null, jobId: null, model, prompt, error: "First frame is a placeholder or could not be uploaded for video generation" };

    const coveredIds = group.slice(1).map((p) => p.id);
    const { data: inserted, error: insertErr } = await supabase
      .from("video_clips")
      .insert({
        project_id: id,
        panel_id: panel.id,
        first_frame_id: frame.id,
        higgsfield_job_id: result.jobId,
        status: result.status === "completed" ? "completed" : result.status === "failed" ? "failed" : "pending",
        video_url: result.videoUrl,
        duration_seconds: groupDuration,
        model_used: result.model,
        prompt_used: result.prompt,
        covered_panel_ids: coveredIds,
        motion_description:
          group.length > 1
            ? `Sequence: panels ${group[0].panel_number}–${group[group.length - 1].panel_number} (${group.length} shots)`
            : `${genReq.cameraMovement || "static"} — ${genReq.actionDescription}`,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      errors.push(`Panel ${panel.panel_number}: insert failed — ${insertErr?.message}`);
      continue;
    }

    // Mark the whole group covered so later iterations of the bulk loop
    // (and re-entrant calls) skip the sibling panels.
    panelsWithClip.add(panel.id);
    for (const cid of coveredIds) panelsWithClip.add(cid);

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
