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

// Generic scene-heading words that must NEVER be a matchable location token
// (they appear in almost every heading and would cause false binds).
const HEADING_STOPWORDS = new Set([
  "int", "ext", "the", "and", "morning", "day", "night", "evening", "dawn", "dusk",
  "late", "early", "afternoon", "continuous", "moments", "later", "present", "past",
  "house", "room", "1807", "2037", "1800", "1800s",
]);

function locationTokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3 && !HEADING_STOPWORDS.has(t));
}

/**
 * Resolve the location element id for a scene heading. Exact → substring →
 * SHARED-TOKEN (e.g. "EXT. THE NEPTUNE - MERCHANT SHIP HIJACK" ↔
 * "PB-Neptune-Deck-1807-V" share "neptune"). The token pass is what stops the
 * model inventing a set when heading and element name aren't substrings of each
 * other. null = MISSING SET — the caller should flag it, not let the model
 * improvise a background.
 */
export function resolveLocationElementId(
  locationName: string,
  locationElementByName: Record<string, string>
): string | null {
  const key = (locationName || "").toLowerCase().trim();
  if (!key) return null;
  if (locationElementByName[key]) return locationElementByName[key];
  const sub = Object.entries(locationElementByName).find(
    ([name]) => name.includes(key) || key.includes(name)
  );
  if (sub) return sub[1];
  const keyTokens = new Set(locationTokens(key));
  let best: { id: string; score: number } | null = null;
  for (const [name, id] of Object.entries(locationElementByName)) {
    const shared = locationTokens(name).filter((t) => keyTokens.has(t)).length;
    if (shared > 0 && (!best || shared > best.score)) best = { id, score: shared };
  }
  return best?.id || null;
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
  /** Per-character wardrobe for THIS scene (scenes.wardrobe). Drives the
   *  wardrobe-by-character lock so an outfit element is injected on every shot
   *  a character appears in — not only shots whose action text says "outfit". */
  sceneWardrobe?: Array<{ character: string; description: string }>;
}

/**
 * Resolve which trained outfit element each in-shot character should wear,
 * from the scene's wardrobe map. This is the fix for costume drift: wardrobe
 * binds to character+scene, not to whether the action text happens to mention
 * the outfit. Matches a wardrobe description (e.g. "Antique 1800s Canton female
 * pirate outfit") to an outfit element by shared significant tokens with the
 * element's match-terms or name (e.g. "Canton Pirate Outfit").
 */
export function resolveWardrobeForShot(
  charactersInShot: string[],
  sceneWardrobe: Array<{ character: string; description: string }> | undefined,
  registry: ProjectElementRegistry
): Array<{ character: string; elementId: string; name: string; description: string }> {
  if (!sceneWardrobe?.length) return [];
  const outfits = registry.registryElements.filter((el) => el.kind === "outfit");
  if (!outfits.length) return [];
  const inShot = new Set(charactersInShot.map((n) => (n || "").toLowerCase().trim()));
  const out: Array<{ character: string; elementId: string; name: string; description: string }> = [];
  const seen = new Set<string>();
  for (const w of sceneWardrobe) {
    if (!inShot.has((w.character || "").toLowerCase().trim())) continue;
    const desc = (w.description || "").toLowerCase();
    if (!desc) continue;
    // Match a wardrobe description to an outfit element via (a) a full match-term
    // hit, or (b) ≥2 shared significant name tokens. The ≥2 floor stops a single
    // common token like "pirate" from putting Jing's female Canton outfit onto
    // Zhan Bao (whose "pirate attire" shares only that one word).
    const el = outfits.find((o) => {
      if (o.matchTerms.some((t) => t.trim().length > 2 && desc.includes(t.toLowerCase()))) return true;
      const shared = locationTokens(o.name).filter((tk) => desc.includes(tk)).length;
      return shared >= 2;
    });
    if (el && !seen.has(`${w.character}|${el.elementId}`)) {
      seen.add(`${w.character}|${el.elementId}`);
      out.push({ character: w.character, elementId: el.elementId, name: el.name, description: w.description });
    }
  }
  return out;
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
 * Trim the production-notes blob into a clean STYLE block: a capped bible
 * summary, the WORLD RULES (anachronism) line, and the TOP 3 QA lessons —
 * instead of dumping the full bible + a 2000-char lessons paragraph into
 * every prompt. productionNotes = bible + "\n\n" + worldDirectives, where
 * worldDirectives starts with "WORLD RULES" / "LESSONS FROM PRIOR REVIEWS".
 */
function trimKeyframeStyle(productionNotes?: string): { style: string; world: string; lessons: string } {
  const pn = (productionNotes || "").trim();
  if (!pn) return { style: "Cinematic, photoreal film still.", world: "", lessons: "" };
  const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);
  const wrIdx = pn.search(/WORLD RULES/i);
  const leIdx = pn.search(/LESSONS FROM PRIOR REVIEWS/i);
  let bibleEnd = pn.length;
  if (wrIdx > -1) bibleEnd = Math.min(bibleEnd, wrIdx);
  if (leIdx > -1) bibleEnd = Math.min(bibleEnd, leIdx);
  const style = cap(pn.slice(0, bibleEnd).trim(), 460) || "Cinematic, photoreal film still.";
  let world = "";
  if (wrIdx > -1) world = cap(pn.slice(wrIdx, leIdx > wrIdx ? leIdx : undefined).trim(), 360);
  let lessons = "";
  if (leIdx > -1) {
    const items = pn.slice(leIdx).replace(/LESSONS FROM PRIOR REVIEWS \(apply all\):/i, "")
      .split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3).map((s) => cap(s, 150));
    if (items.length) lessons = `AVOID (prior QA): ${items.join(" · ")}`;
  }
  return { style, world, lessons };
}

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
  const actionLower = (panel.actionDescription || "").toLowerCase();
  // Characters → only if in this shot. Props/outfits → only if a match-term
  // actually appears in the action text (so an Eye-Locket / pirate-outfit shot
  // locks them, but the other registered props don't spam every prompt).
  const scopedElements = registry.registryElements.filter((el) =>
    el.kind === "character"
      ? el.matchTerms.some((t) => inShotLower.has(t.toLowerCase()))
      : el.matchTerms.some((t) => t.trim().length > 1 && actionLower.includes(t.toLowerCase()))
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

  // WARDROBE LOCK (character+scene → outfit element). Inject the outfit on every
  // shot the character is in, regardless of whether the action text names it —
  // the fix for the multi-outfit drift. Drop outfits already tagged via the
  // action text to avoid a double placeholder.
  const wardrobe = resolveWardrobeForShot(panel.charactersInShot, panel.sceneWardrobe, registry).filter(
    (w) => !used.some((u) => u.elementId === w.elementId)
  );
  const wardrobeNote =
    wardrobe.length > 0
      ? "WARDROBE LOCK: " +
        wardrobe
          .map(
            (w) =>
              `<<<${w.elementId}>>> — ${w.character} wears the EXACT ${w.name} (${(w.description || "").slice(0, 90)}), identical in every shot; no substitutions, no added hat.`
          )
          .join(" ")
      : "";

  // Continuity: ONLY visual descriptions of elements actually in this shot
  // (character elements carry no description here; prop/outfit element
  // descriptions are bible meta, not visual — the <<<id>>> tag already locks
  // them — so they're excluded to avoid the "lock in every shot…" spam).
  const continuityText = [...used, ...unmentioned]
    .filter((el) => el.kind === "character" && el.description)
    .map((el) => el.description)
    .join(" ");

  const framing = [panel.shotType || "medium shot", panel.cameraAngle && panel.cameraAngle !== "eye-level" ? panel.cameraAngle : ""]
    .filter(Boolean)
    .join(", ");
  const { style, world, lessons } = trimKeyframeStyle(panel.productionNotes);

  const lines = [
    identityLock,
    `SUBJECT: ${action}.${castNote}${setNote}`,
    panel.mood ? `MOOD: ${panel.mood}.` : "",
    `SHOT: ${framing}. ${panel.timeOfDay ? panel.timeOfDay + ", " : ""}cinematic lighting.`,
    `STYLE: ${style}`,
    world,
    continuityText ? `CONTINUITY: ${continuityText}` : "",
    wardrobeNote,
    lessons,
    `NEGATIVE: ${KEYFRAME_NEGATIVES}`,
    `FORMAT: single photographic keyframe, ${panel.aspectRatio}.`,
  ].filter(Boolean);

  // Collect the element ids actually referenced in the prompt text.
  const idSet = new Set<string>();
  for (const el of [...used, ...unmentioned]) idSet.add(el.elementId);
  for (const w of wardrobe) idSet.add(w.elementId);
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
    .select("id, location, time_of_day, mood, wardrobe")
    .in("id", sceneIds);
  type SceneMeta = { location: string; time_of_day: string; mood: string; wardrobe: Array<{ character: string; description: string }> };
  const sceneById: Record<string, SceneMeta> = {};
  for (const s of scenes || [])
    sceneById[s.id] = {
      location: s.location || "",
      time_of_day: s.time_of_day || "",
      mood: s.mood || "",
      wardrobe: Array.isArray(s.wardrobe) ? s.wardrobe : [],
    };

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
    const scene = sceneById[panel.scene_id] || { location: "", time_of_day: "", mood: "", wardrobe: [] };
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
        sceneWardrobe: scene.wardrobe,
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
