/**
 * element-keyframes.ts — Track A (connector seam).
 *
 * The keyframe twin of generate-video.ts. The deployed first-frame path
 * renders character shots with Gemini one-shot references (weak identity).
 * This module builds the ELEMENT-TAGGED keyframe prompt — characters,
 * wardrobe/outfits, props, and the location all swapped to
 * `<<<element_id>>>` placeholders the Higgsfield connector resolves to
 * trained references — so identity/wardrobe/set are locked the same way the
 * video step locks them.
 *
 * Execution mirrors video: prod can't reach Higgsfield, so a character-shot
 * frame is created as a DEFERRED placeholder carrying this prompt, and a
 * connector runner (scripts/fulfill-frames.mjs, REST) or a Cowork agent
 * (MCP) generates it and PATCHes the image back. Environment-only shots stay
 * on Gemini (it scores 9-10 there).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyElementPlaceholders,
  rankAndCapElements,
  type RegistryElement,
} from "@/lib/prompt-engine";
import { getWorldDirectives } from "@/lib/lessons";
import { normalizeProjectAspectRatio } from "@/lib/types";

/** Marks a first_frames row as awaiting Higgsfield element fulfillment. */
export const HIGGSFIELD_FRAME_MODEL = "higgsfield_nano_banana_2";

/** SVG shown until the connector fulfills the element keyframe. */
export function deferredFramePlaceholder(label: string): string {
  const text = label.replace(/[<&]/g, " ").slice(0, 48);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><rect width="540" height="960" fill="#14110f"/><text x="50%" y="46%" fill="#caa86a" font-family="monospace" font-size="22" text-anchor="middle">ELEMENT KEYFRAME</text><text x="50%" y="52%" fill="#6f655a" font-family="monospace" font-size="15" text-anchor="middle">pending Higgsfield fulfillment</text><text x="50%" y="57%" fill="#4d463d" font-family="monospace" font-size="13" text-anchor="middle">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function isDeferredHiggsfieldFrame(modelUsed?: string | null, imageUrl?: string | null): boolean {
  return (
    (modelUsed || "").startsWith("higgsfield") &&
    !!imageUrl &&
    imageUrl.startsWith("data:image/svg")
  );
}

export interface ProjectElementRegistry {
  registryElements: RegistryElement[];
  /** location name (lowercased, trimmed) → element id */
  locationElementByName: Record<string, string>;
  hasAnyCharacterElement: boolean;
}

/**
 * Load every trained element for a project, exactly as the video step does:
 * characters.higgsfield_element_id + locations.higgsfield_element_id +
 * project_elements (props/outfits/extra environments) that are element_ready.
 */
export async function loadProjectElementRegistry(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectElementRegistry> {
  const registryElements: RegistryElement[] = [];
  let hasAnyCharacterElement = false;

  const { data: charRows } = await supabase
    .from("characters")
    .select("name, higgsfield_element_id")
    .eq("project_id", projectId)
    .not("higgsfield_element_id", "is", null);
  for (const c of charRows || []) {
    registryElements.push({
      kind: "character",
      name: c.name,
      elementId: c.higgsfield_element_id as string,
      matchTerms: [c.name],
    });
    hasAnyCharacterElement = true;
  }

  const { data: locRows } = await supabase
    .from("locations")
    .select("name, higgsfield_element_id")
    .eq("project_id", projectId)
    .not("higgsfield_element_id", "is", null);
  const locationElementByName: Record<string, string> = {};
  for (const l of locRows || []) {
    locationElementByName[(l.name || "").toLowerCase().trim()] = l.higgsfield_element_id as string;
  }

  const { data: extra } = await supabase
    .from("project_elements")
    .select("kind, name, match_terms, description, higgsfield_element_id")
    .eq("project_id", projectId)
    .eq("status", "element_ready")
    .not("higgsfield_element_id", "is", null);
  for (const el of extra || []) {
    if (el.kind === "character") hasAnyCharacterElement = true;
    registryElements.push({
      kind: el.kind as RegistryElement["kind"],
      name: el.name,
      elementId: el.higgsfield_element_id as string,
      matchTerms: (el.match_terms || []).length > 0 ? el.match_terms : [el.name],
      description: el.description || undefined,
    });
  }

  // ── Series-level inheritance (Track C1) ──────────────────────────
  // If this project belongs to a series, merge the series asset library —
  // characters/props/outfits/environments created ONCE for the whole series.
  // Project-level rows win on (kind, name) collision. Gated on series_id so
  // existing per-project projects are completely unaffected. The merged
  // elements enter the SAME array rankAndCapElements ranks — the 4-element cap
  // is never bypassed.
  // series_id is absent until the series migration is applied → error set,
  // proj null, series pass skipped. Explicit so a future edit can't silently
  // 500 the existing video/keyframe paths that call this loader.
  const { data: proj, error: projErr } = await supabase.from("projects").select("series_id").eq("id", projectId).maybeSingle();
  if (!projErr && proj?.series_id) {
    const have = new Set(registryElements.map((e) => `${e.kind}:${e.name.toLowerCase()}`));
    const haveLoc = new Set(Object.keys(locationElementByName));
    const { data: seriesEls } = await supabase
      .from("project_elements")
      .select("kind, name, match_terms, description, higgsfield_element_id")
      .eq("series_id", proj.series_id)
      .eq("active", true)
      .eq("status", "element_ready")
      .not("higgsfield_element_id", "is", null);
    for (const el of seriesEls || []) {
      if (el.kind === "environment") {
        const key = (el.name || "").toLowerCase().trim();
        if (!haveLoc.has(key)) locationElementByName[key] = el.higgsfield_element_id as string;
        continue;
      }
      if (have.has(`${el.kind}:${el.name.toLowerCase()}`)) continue; // project override wins
      if (el.kind === "character") hasAnyCharacterElement = true;
      registryElements.push({
        kind: el.kind as RegistryElement["kind"],
        name: el.name,
        elementId: el.higgsfield_element_id as string,
        matchTerms: (el.match_terms || []).length > 0 ? el.match_terms : [el.name],
        description: el.description || undefined,
      });
    }
  }

  return { registryElements, locationElementByName, hasAnyCharacterElement };
}

/** Resolve the location element id for a scene's location name (exact, then substring). */
export function resolveLocationElementId(
  locationName: string,
  locationElementByName: Record<string, string>
): string | null {
  const key = (locationName || "").toLowerCase().trim();
  if (!key) return null;
  return (
    locationElementByName[key] ||
    Object.entries(locationElementByName).find(
      ([name]) => name.includes(key) || key.includes(name)
    )?.[1] ||
    null
  );
}

export interface KeyframePanelInput {
  panelNumber: number;
  shotType: string;
  cameraAngle: string;
  charactersInShot: string[];
  actionDescription: string;
  locationName: string;
  timeOfDay?: string;
  mood?: string;
  productionNotes?: string;
  aspectRatio: string;
}

export interface KeyframePromptResult {
  /** Connector-ready prompt with <<<element_id>>> placeholders. */
  prompt: string;
  /** Element ids referenced in the prompt (for the runner / MCP call). */
  elementIds: string[];
  /** True when ≥1 character element is in this shot → route to Higgsfield. */
  routeToHiggsfield: boolean;
}

const KEYFRAME_NEGATIVES =
  "Not a contact sheet, not a grid, not multiple panels, not an illustration. " +
  "No facial warping, no identity drift, no wardrobe change, no text overlays or watermarks.";

/**
 * Build a single-keyframe prompt with element placeholders. Reuses the video
 * prompt engine's element ranking + match-term → <<<id>>> swap (the SAME
 * locks the video step uses), but emits a STILL structure: identity lock →
 * subject/action → set lock → shot/lighting → grade → negatives → format.
 */
export function buildKeyframePrompt(
  panel: KeyframePanelInput,
  registry: ProjectElementRegistry
): KeyframePromptResult {
  const locationElementId = resolveLocationElementId(panel.locationName, registry.locationElementByName);

  // A still keyframe only depicts the characters in THIS shot — drop absent
  // characters so they don't consume the 4 reference slots ahead of the
  // in-shot character's wardrobe/props (the wardrobe-drift bug). Non-character
  // elements (outfits/props/extra envs) are kept; ranking sorts them.
  const inShotLower = new Set(panel.charactersInShot.map((n) => n.toLowerCase()));
  const scopedElements = registry.registryElements.filter(
    (el) => el.kind !== "character" || el.matchTerms.some((t) => inShotLower.has(t.toLowerCase()))
  );

  // Rank + cap to the ~4-reference practical limit; the location reserves a slot.
  const { active, overflow } = rankAndCapElements(
    scopedElements,
    panel.charactersInShot,
    locationElementId ? 1 : 0
  );

  // Swap match-terms in the action text → <<<element_id>>> (characters,
  // wardrobe/outfits, props). Same engine as buildShotPrompt.
  const { text: action, used } = applyElementPlaceholders(panel.actionDescription, active);

  // Characters scripted in the shot but never named in the action still get
  // an explicit cast note so their identity is anchored.
  const unmentioned = active.filter(
    (el) =>
      el.kind === "character" &&
      !used.includes(el) &&
      panel.charactersInShot.some((n) => el.matchTerms.some((t) => t.toLowerCase() === n.toLowerCase()))
  );
  const castNote =
    unmentioned.length > 0
      ? ` In shot: ${unmentioned.map((el) => `<<<${el.elementId}>>> (${el.name})`).join(", ")}.`
      : "";
  const setNote = locationElementId
    ? ` Set: <<<${locationElementId}>>> — same layout and dressing as the reference, no redesign.`
    : "";

  const usedCharacters = [...used, ...unmentioned].filter((el) => el.kind === "character");
  const identityLock =
    usedCharacters.length > 0
      ? `Preserve exact facial structure, skin tone, hairstyle and wardrobe from the trained references for ${usedCharacters
          .map((el) => `<<<${el.elementId}>>>`)
          .join(", ")}. Do not regenerate, beautify, or restyle any face.`
      : "";

  // Continuity descriptions for capped-out elements (kept as text, no slot).
  const continuityText = [...used, ...unmentioned, ...overflow]
    .filter((el) => el.description)
    .map((el) => el.description)
    .join(" ");

  const framing = [panel.shotType || "medium shot", panel.cameraAngle && panel.cameraAngle !== "eye-level" ? panel.cameraAngle : ""]
    .filter(Boolean)
    .join(", ");
  const grade = (panel.productionNotes || "").trim();

  const lines = [
    identityLock,
    `SUBJECT: ${action}.${castNote}${setNote}`,
    panel.mood ? `MOOD: ${panel.mood}.` : "",
    `SHOT: ${framing}. ${panel.timeOfDay ? panel.timeOfDay + ", " : ""}cinematic lighting.`,
    grade ? `STYLE: ${grade}` : "Photoreal, cinematic film still.",
    continuityText ? `CONTINUITY: ${continuityText}` : "",
    `NEGATIVE: ${KEYFRAME_NEGATIVES}`,
    `FORMAT: single photographic keyframe, ${panel.aspectRatio}.`,
  ].filter(Boolean);

  // Collect the element ids actually referenced in the prompt text.
  const idSet = new Set<string>();
  for (const el of [...used, ...unmentioned]) idSet.add(el.elementId);
  if (locationElementId) idSet.add(locationElementId);

  return {
    prompt: lines.join("\n"),
    elementIds: Array.from(idSet),
    routeToHiggsfield: usedCharacters.length > 0,
  };
}

export interface PlanElementKeyframesResult {
  planned: number;
  skippedNoElement: number;
  frames: Array<{ frameId: string; panelId: string; sceneNumber: number; prompt: string; elementIds: string[] }>;
}

/**
 * Plan deferred element keyframes for every character shot that has at least
 * one trained element. Inserts a DEFERRED placeholder first_frames row
 * (status 'pending', model HIGGSFIELD_FRAME_MODEL, image = SVG placeholder)
 * whose prompt_used is the connector-ready <<<element_id>>> prompt. The
 * runner (scripts/fulfill-frames.mjs) or a Cowork agent renders it via
 * Higgsfield and PATCHes the image back. Environment-only shots are left to
 * the Gemini first-frame path. Idempotent: skips panels that already have a
 * deferred or approved element frame.
 */
export async function planElementKeyframes(
  supabase: SupabaseClient,
  projectId: string,
  options: { panelIds?: string[]; regen?: boolean } = {}
): Promise<PlanElementKeyframesResult> {
  const registry = await loadProjectElementRegistry(supabase, projectId);
  if (!registry.hasAnyCharacterElement) {
    return { planned: 0, skippedNoElement: 0, frames: [] };
  }

  const { data: projectRow } = await supabase
    .from("projects")
    .select("production_notes, aspect_ratio")
    .eq("id", projectId)
    .single();
  const worldDirectives = await getWorldDirectives(supabase, projectId);
  const productionNotes = [projectRow?.production_notes || "", worldDirectives].filter(Boolean).join("\n\n");
  const aspectRatio = normalizeProjectAspectRatio(projectRow?.aspect_ratio);

  let panelsQuery = supabase
    .from("storyboard_panels")
    .select("id, scene_id, panel_number, shot_type, camera_angle, action_description, characters_in_shot, approved_first_frame_id")
    .eq("project_id", projectId)
    .order("panel_number", { ascending: true });
  if (options.panelIds && options.panelIds.length > 0) {
    panelsQuery = panelsQuery.in("id", options.panelIds);
  }
  const { data: panels } = await panelsQuery;
  if (!panels || panels.length === 0) return { planned: 0, skippedNoElement: 0, frames: [] };

  const sceneIds = Array.from(new Set(panels.map((p) => p.scene_id)));
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, location, time_of_day, mood")
    .in("id", sceneIds);
  const sceneById: Record<string, { location: string; time_of_day: string; mood: string }> = {};
  for (const s of scenes || []) sceneById[s.id] = { location: s.location || "", time_of_day: s.time_of_day || "", mood: s.mood || "" };

  // Dedup: never queue a second PENDING element frame for a panel. In normal
  // (non-regen) planning also skip panels that already have an APPROVED element
  // frame. For propagation regen (options.regen) we DO re-queue approved panels
  // so the new reference rebuilds them — the old approved frame stays until the
  // new one is fulfilled + approved (non-destructive).
  const { data: existing } = await supabase
    .from("first_frames")
    .select("panel_id, model_used, status")
    .eq("project_id", projectId)
    .neq("status", "replaced");
  const pendingElementFrame = new Set<string>();
  const approvedElementFrame = new Set<string>();
  for (const f of existing || []) {
    if (!(f.model_used || "").startsWith("higgsfield")) continue;
    if (f.status === "pending") pendingElementFrame.add(f.panel_id);
    else approvedElementFrame.add(f.panel_id);
  }

  const out: PlanElementKeyframesResult = { planned: 0, skippedNoElement: 0, frames: [] };
  for (const panel of panels) {
    if (pendingElementFrame.has(panel.id)) continue; // already queued
    if (!options.regen && approvedElementFrame.has(panel.id)) continue; // already done
    const scene = sceneById[panel.scene_id] || { location: "", time_of_day: "", mood: "" };
    const built = buildKeyframePrompt(
      {
        panelNumber: panel.panel_number,
        shotType: panel.shot_type || "",
        cameraAngle: panel.camera_angle || "",
        charactersInShot: panel.characters_in_shot || [],
        actionDescription: panel.action_description || "",
        locationName: scene.location,
        timeOfDay: scene.time_of_day,
        mood: scene.mood,
        productionNotes,
        aspectRatio,
      },
      registry
    );
    if (!built.routeToHiggsfield) {
      out.skippedNoElement++;
      continue;
    }
    const { data: inserted } = await supabase
      .from("first_frames")
      .insert({
        project_id: projectId,
        panel_id: panel.id,
        image_url: deferredFramePlaceholder(`panel ${panel.panel_number}`),
        prompt_used: built.prompt,
        model_used: HIGGSFIELD_FRAME_MODEL,
        aspect_ratio: aspectRatio,
        status: "pending",
      })
      .select("id")
      .single();
    if (inserted) {
      out.planned++;
      out.frames.push({
        frameId: inserted.id,
        panelId: panel.id,
        sceneNumber: 0,
        prompt: built.prompt,
        elementIds: built.elementIds,
      });
    }
  }
  return out;
}
