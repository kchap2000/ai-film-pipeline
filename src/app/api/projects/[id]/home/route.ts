import { createRouteClient } from "@/lib/supabase-route";
import { getProjectAccess } from "@/lib/project-access";
import { normalizeProjectAspectRatio } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function firstText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function listFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function buildBiblePreview(structure: Record<string, unknown> | null, productionNotes: string | null) {
  const themes = listFrom(structure?.themes || structure?.theme);
  const tone = firstText(structure?.tone, firstText(structure?.genre, "Creative direction is ready for refinement."));
  const premise = firstText(
    structure?.logline,
    firstText(structure?.premise, firstText(structure?.summary, "Upload and extract a script to build the film bible."))
  );
  const world = firstText(
    structure?.world,
    firstText(structure?.setting, "Locations, atmosphere, and production rules will appear here as the project develops.")
  );
  const visualRules = productionNotes?.trim()
    ? [productionNotes.trim()]
    : ["No locked visual rules yet. Add director notes to guide casting, scouting, storyboards, and first frames."];

  return {
    premise,
    tone,
    world,
    themes: themes.slice(0, 5),
    visual_rules: visualRules,
  };
}

function allDone(done: number, total: number) {
  return total > 0 && done === total;
}

function workflowCheck(label: string, done: number, total: number, href: string) {
  return {
    label,
    done,
    total,
    ok: allDone(done, total),
    href,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const [
    projectRes,
    filesRes,
    extractionRes,
    charactersRes,
    castRes,
    locationsRes,
    locationVarsRes,
    scenesRes,
    panelsRes,
    framesRes,
    decisionsRes,
    jobsRes,
    collaboratorsRes,
    activityRes,
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("project_files").select("*").eq("project_id", id).order("uploaded_at", { ascending: false }),
    supabase.from("extractions").select("structure, created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("characters")
      .select("id, name, description, role, personality, voice_only, approved_cast_id, locked")
      .eq("project_id", id)
      .order("role", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("cast_variations")
      .select("id, character_id, status, variation_number")
      .eq("project_id", id)
      .eq("status", "approved"),
    supabase
      .from("locations")
      .select("id, name, description, time_of_day, mood, locked")
      .eq("project_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("location_variations")
      .select("id, location_id, status, variation_number")
      .eq("project_id", id)
      .eq("status", "approved"),
    supabase
      .from("scenes")
      .select("id, scene_number, location, time_of_day, scene_type, action_summary, mood, props, characters_present, locked, approved_scout_image_url")
      .eq("project_id", id)
      .order("scene_number", { ascending: true }),
    supabase
      .from("storyboard_panels")
      .select("id, scene_id, panel_number, shot_type, camera_angle, action_description, approved_first_frame_id, aspect_ratio")
      .eq("project_id", id)
      .order("panel_number", { ascending: true }),
    supabase
      .from("first_frames")
      .select("id, panel_id, status, aspect_ratio, created_at")
      .eq("project_id", id)
      .neq("status", "replaced")
      .order("created_at", { ascending: false }),
    supabase
      .from("project_decisions")
      .select("id, decision_type, subject_type, subject_id, status, notes, decided_by_email, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("generation_jobs")
      .select("id, job_type, action, target_type, target_id, target_label, status, priority, prompt, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("project_collaborators")
      .select("id, email, role, status, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("project_activity")
      .select("id, activity_type, title, body, actor_email, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (projectRes.error || !projectRes.data) {
    return NextResponse.json({ error: projectRes.error?.message || "Project not found" }, { status: 404 });
  }

  const project = {
    ...projectRes.data,
    aspect_ratio: normalizeProjectAspectRatio(projectRes.data.aspect_ratio),
  };

  const approvedCastByCharacter = new Map((castRes.data || []).map((variation) => [variation.character_id, variation]));
  const approvedLocationByLocation = new Map((locationVarsRes.data || []).map((variation) => [variation.location_id, variation]));
  type PanelRow = NonNullable<typeof panelsRes.data>[number];
  type FrameRow = NonNullable<typeof framesRes.data>[number];
  const panelsByScene = new Map<string, PanelRow[]>();
  for (const panel of panelsRes.data || []) {
    if (!panelsByScene.has(panel.scene_id)) panelsByScene.set(panel.scene_id, []);
    panelsByScene.get(panel.scene_id)!.push(panel);
  }

  const latestFrameByPanel = new Map<string, FrameRow>();
  for (const frame of framesRes.data || []) {
    if (!latestFrameByPanel.has(frame.panel_id)) latestFrameByPanel.set(frame.panel_id, frame);
  }

  const characters = (charactersRes.data || []).map((character) => ({
    ...character,
    approved_image:
      approvedCastByCharacter.get(character.id)?.id
        ? {
            api_url: `/api/projects/${id}/cast/image?variation_id=${approvedCastByCharacter.get(character.id)!.id}`,
            response_key: "image_url",
          }
        : null,
  }));

  const locations = (locationsRes.data || []).map((location) => ({
    ...location,
    approved_image: location.locked
      ? {
          api_url: `/api/projects/${id}/locations/image?location_id=${location.id}&type=approved`,
          response_key: "approved_image_url",
        }
      : approvedLocationByLocation.get(location.id)?.id
      ? {
          api_url: `/api/projects/${id}/locations/image?variation_id=${approvedLocationByLocation.get(location.id)!.id}`,
          response_key: "image_url",
        }
      : null,
  }));

  const scenes = (scenesRes.data || []).map((scene) => {
    const { approved_scout_image_url: approvedScoutImageUrl, ...sceneMeta } = scene;
    const panels = panelsByScene.get(scene.id) || [];
    const frame = panels.map((panel) => latestFrameByPanel.get(panel.id)).find(Boolean) || null;
    return {
      ...sceneMeta,
      has_approved_scout: Boolean(approvedScoutImageUrl),
      panel_count: panels.length,
      preview_image: scene.locked
        ? {
            api_url: `/api/projects/${id}/scenes/image?scene_id=${scene.id}&type=approved`,
            response_key: "approved_scout_image_url",
          }
        : frame?.id
        ? {
            api_url: `/api/projects/${id}/first-frames/image?frame_id=${frame.id}`,
            response_key: "image_url",
          }
        : null,
    };
  });

  const frameGallery = (framesRes.data || [])
    .slice(0, 8)
    .map((frame) => ({
      ...frame,
      image: {
        api_url: `/api/projects/${id}/first-frames/image?frame_id=${frame.id}`,
        response_key: "image_url",
      },
    }));

  const totalPanels = (panelsRes.data || []).length;
  const approvedFrames = (panelsRes.data || []).filter((panel) => panel.approved_first_frame_id).length;
  const castableCharacters = characters.filter((character) => !character.voice_only);
  const castApproved = castableCharacters.filter((character) => character.approved_cast_id || character.approved_image).length;
  const castLocked = castableCharacters.filter((character) => character.locked && (character.approved_cast_id || character.approved_image)).length;
  const locationsApproved = locations.filter((location) => location.approved_image).length;
  const scenesScouted = scenes.filter((scene) => scene.has_approved_scout || scene.locked).length;
  const scenesWithPanels = scenes.filter((scene) => scene.panel_count > 0).length;
  const generatedPanelIds = new Set((framesRes.data || []).map((frame) => frame.panel_id));
  const framesGenerated = (panelsRes.data || []).filter((panel) => generatedPanelIds.has(panel.id)).length;
  const openJobs = (jobsRes.data || []).filter((job) => ["queued", "running", "failed"].includes(job.status));
  const revisionDecisions = (decisionsRes.data || []).filter((decision) => decision.status === "needs_changes" || decision.status === "rejected");
  const workflowChecks = {
    cast_approved: workflowCheck("Cast approved", castApproved, castableCharacters.length, `/projects/${id}/cast`),
    cast_locked: workflowCheck("Cast locked", castLocked, castableCharacters.length, `/projects/${id}/lock`),
    locations_approved: workflowCheck("Locations approved", locationsApproved, locations.length, `/projects/${id}/locations`),
    scenes_scouted: workflowCheck("Scenes scouted", scenesScouted, scenes.length, `/projects/${id}/scenes`),
    scenes_have_panels: workflowCheck("Scenes have panels", scenesWithPanels, scenes.length, `/projects/${id}/storyboard`),
    first_frames_generated: workflowCheck("First frames generated", framesGenerated, totalPanels, `/projects/${id}/first-frames`),
    first_frames_approved: workflowCheck("First frames approved", approvedFrames, totalPanels, `/projects/${id}/first-frames`),
  };
  const workflowBlockers = Object.entries(workflowChecks)
    .filter(([, check]) => !check.ok)
    .map(([key, check]) => ({ key, ...check }));

  const nextAction =
    (filesRes.data || []).length === 0
      ? {
          label: "Upload the source script",
          detail: "Add a PDF, DOCX, or TXT file so the project can become a film bible.",
          href: null,
          action: "upload",
        }
      : project.phase_status === "ingestion"
      ? {
          label: "Build the film bible",
          detail: "Run extraction to turn the uploaded document into characters, scenes, locations, and story structure.",
          href: null,
          action: "extract",
        }
      : revisionDecisions.length > 0
      ? {
          label: "Resolve requested changes",
          detail: "There are client or reviewer notes that should be addressed before moving forward.",
          href: `/projects/${id}/review`,
          action: "review",
        }
      : openJobs.length > 0
      ? {
          label: "Review queued generation work",
          detail: "Generation requests are waiting for producer review or execution.",
          href: `/projects/${id}/review`,
          action: "generation_queue",
        }
      : {
          label: "Continue the current phase",
          detail: "Open the review workroom or the active creative step to keep the project moving.",
          href: `/projects/${id}/review`,
          action: "continue",
        };

  return NextResponse.json({
    access,
    project,
    files: filesRes.data || [],
    bible: buildBiblePreview((extractionRes.data?.structure || null) as Record<string, unknown> | null, project.production_notes),
    characters,
    locations,
    scenes,
    frame_gallery: frameGallery,
    decisions: decisionsRes.data || [],
    generation_jobs: jobsRes.data || [],
    collaborators: collaboratorsRes.data || [],
    activity: activityRes.data || [],
    counts: {
      files: (filesRes.data || []).length,
      characters: characters.length,
      cast_locked: castLocked,
      locations: locations.length,
      locations_approved: locationsApproved,
      scenes: scenes.length,
      storyboard_panels: totalPanels,
      first_frames: (framesRes.data || []).length,
      first_frames_approved: approvedFrames,
      open_jobs: openJobs.length,
      open_revisions: revisionDecisions.length,
    },
    workflow: {
      checks: workflowChecks,
      blockers: workflowBlockers,
      primary_blocker: workflowBlockers[0] || null,
      ready_for_first_frames:
        workflowChecks.cast_locked.ok &&
        workflowChecks.locations_approved.ok &&
        workflowChecks.scenes_scouted.ok &&
        workflowChecks.scenes_have_panels.ok,
      ready_for_generation: workflowChecks.first_frames_approved.ok && revisionDecisions.length === 0,
    },
    next_action: nextAction,
  });
}
