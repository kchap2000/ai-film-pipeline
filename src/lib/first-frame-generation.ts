import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateFirstFrame,
  ReferenceImageUnreachableError,
} from "@/lib/generate-image";
import { getProjectBrainPrompt } from "@/lib/project-brain";
import { recordProvenance, type ProvenanceSource } from "@/lib/provenance";
import { normalizeProjectAspectRatio } from "@/lib/types";

interface FirstFrameSceneContext {
  id: string;
  location: string | null;
  time_of_day: string | null;
  mood: string | null;
  approved_scout_image_url: string | null;
}

interface GenerateProjectFirstFramesOptions {
  panelId?: string | null;
  panelIds?: string[];
  feedbackNote?: string | null;
  feedbackId?: string | null;
}

export interface GenerateProjectFirstFramesResult {
  success: boolean;
  framesGenerated: number;
  panelsProcessed: number;
  errors: string[];
  frameIds: string[];
}

export async function generateProjectFirstFrames(
  supabase: SupabaseClient,
  projectId: string,
  options: GenerateProjectFirstFramesOptions = {}
): Promise<GenerateProjectFirstFramesResult> {
  const singlePanelId = options.panelId || undefined;
  const panelIds = Array.from(new Set(options.panelIds || [])).filter(Boolean);
  const targetedRun = Boolean(singlePanelId || panelIds.length > 0);

  const { data: projectRow } = await supabase
    .from("projects")
    .select("production_notes, phase_status, aspect_ratio")
    .eq("id", projectId)
    .single();
  const productionNotes: string = projectRow?.production_notes || "";
  const aspectRatio = normalizeProjectAspectRatio(projectRow?.aspect_ratio);

  let panelsQuery = supabase
    .from("storyboard_panels")
    .select(
      "id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, characters_in_shot, approved_first_frame_id"
    )
    .eq("project_id", projectId)
    .order("panel_number", { ascending: true });
  if (singlePanelId) {
    panelsQuery = panelsQuery.eq("id", singlePanelId);
  } else if (panelIds.length > 0) {
    panelsQuery = panelsQuery.in("id", panelIds);
  }
  const { data: panels, error: panelErr } = await panelsQuery;
  if (panelErr || !panels || panels.length === 0) {
    return {
      success: false,
      framesGenerated: 0,
      panelsProcessed: 0,
      errors: [panelErr?.message || "No storyboard panels found"],
      frameIds: [],
    };
  }

  const existingFramePanelIds = new Set<string>();
  if (!targetedRun) {
    const { data: existingFrames } = await supabase
      .from("first_frames")
      .select("panel_id, status")
      .eq("project_id", projectId)
      .neq("status", "replaced");

    for (const frame of existingFrames || []) {
      if (frame.panel_id) existingFramePanelIds.add(frame.panel_id);
    }
  }

  const sceneIds = Array.from(new Set(panels.map((panel) => panel.scene_id)));
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, location, time_of_day, mood, approved_scout_image_url")
    .in("id", sceneIds);
  const sceneById: Record<string, FirstFrameSceneContext> = {};
  for (const scene of (scenes || []) as FirstFrameSceneContext[]) sceneById[scene.id] = scene;

  const allCharNames = new Set<string>();
  for (const panel of panels) {
    for (const name of panel.characters_in_shot || []) allCharNames.add(name);
  }

  const headshotByName: Record<string, string | null> = {};
  const charsByName: Record<string, { id: string; approved_cast_id: string | null; voice_only: boolean }> = {};
  if (allCharNames.size > 0) {
    const { data: chars } = await supabase
      .from("characters")
      .select("id, name, approved_cast_id, voice_only")
      .eq("project_id", projectId);
    for (const character of chars || []) charsByName[character.name] = character;

    const castIds = (chars || [])
      .filter((character) => character.approved_cast_id && !character.voice_only)
      .map((character) => character.approved_cast_id as string);

    if (castIds.length > 0) {
      const { data: variations } = await supabase
        .from("cast_variations")
        .select("id, image_url")
        .in("id", castIds);
      const urlByCastId: Record<string, string> = {};
      for (const variation of variations || []) urlByCastId[variation.id] = variation.image_url;
      for (const name of Array.from(allCharNames)) {
        const character = charsByName[name];
        if (character?.approved_cast_id && !character.voice_only) {
          headshotByName[name] = urlByCastId[character.approved_cast_id] || null;
        } else {
          headshotByName[name] = null;
        }
      }
    }
  }

  let framesGenerated = 0;
  const errors: string[] = [];
  const frameIds: string[] = [];

  for (const panel of panels) {
    if (!targetedRun && existingFramePanelIds.has(panel.id)) continue;

    const scene = sceneById[panel.scene_id];
    if (!scene) {
      errors.push(`Panel ${panel.panel_number}: parent scene not found`);
      continue;
    }

    const characterReferences: { name: string; imageUrl: string }[] = [];
    for (const name of panel.characters_in_shot || []) {
      const imageUrl = headshotByName[name];
      if (imageUrl) characterReferences.push({ name, imageUrl });
    }

    const brainPrompt = await getProjectBrainPrompt(supabase, projectId, {
      targetType: "storyboard_panel",
      targetId: panel.id,
      sceneId: panel.scene_id,
      characterNames: panel.characters_in_shot || [],
    });
    const feedbackPrompt = options.feedbackNote
      ? [
          "PROJECT BRAIN REGENERATION REQUEST:",
          `- MUST FOLLOW: ${options.feedbackNote.trim()}`,
        ].join("\n")
      : "";
    const notesWithBrain = [productionNotes, brainPrompt, feedbackPrompt].filter(Boolean).join("\n\n");

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
        productionNotes: notesWithBrain,
        aspectRatio,
      });

      const { data: inserted, error: insertErr } = await supabase
        .from("first_frames")
        .insert({
          project_id: projectId,
          panel_id: panel.id,
          image_url: result.url,
          prompt_used: result.prompt,
          aspect_ratio: aspectRatio,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        errors.push(`Panel ${panel.panel_number}: insert failed - ${insertErr?.message || "no row"}`);
        continue;
      }

      framesGenerated++;
      frameIds.push(inserted.id);
      const sources: ProvenanceSource[] = [
        { sourceType: "storyboard_panel", sourceId: panel.id, relationship: "panel_prompt" },
        { sourceType: "scene", sourceId: panel.scene_id, relationship: "scene_context" },
        { sourceType: "project", sourceId: projectId, relationship: "production_notes" },
      ];
      for (const name of panel.characters_in_shot || []) {
        const charId = charsByName[name]?.id;
        if (charId) {
          sources.push({ sourceType: "character", sourceId: charId, relationship: "character_identity" });
        }
      }

      await recordProvenance(supabase, {
        projectId,
        assetType: "first_frame",
        assetId: inserted.id,
        sources,
        metadata: {
          panel_number: panel.panel_number,
          aspect_ratio: aspectRatio,
          feedback_id: options.feedbackId || null,
        },
      });
    } catch (err) {
      const message =
        err instanceof ReferenceImageUnreachableError
          ? `reference unreachable (${err.message})`
          : err instanceof Error
          ? err.message
          : String(err);
      console.error(`First frame panel ${panel.panel_number} failed:`, message);
      errors.push(`Panel ${panel.panel_number}: ${message}`);
    }
  }

  if (!targetedRun && framesGenerated > 0 && projectRow?.phase_status !== "first_frames") {
    await supabase
      .from("projects")
      .update({ phase_status: "first_frames" })
      .eq("id", projectId);
  }

  const failedCompletely = framesGenerated === 0 && errors.length > 0;
  return {
    success: !failedCompletely,
    framesGenerated,
    panelsProcessed: panels.length,
    errors,
    frameIds,
  };
}
