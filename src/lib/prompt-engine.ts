/**
 * Cinematic prompt engine — encodes PROMPTING.md (read that first).
 *
 * Builds the house-structure video prompt:
 *   [TECHNICAL PREAMBLE] → VISUALS → DIALOGUE → SFX → ELEMENTS → CONTINUITY
 *
 * Element placeholders: any registry element (character / prop / outfit /
 * environment) whose match terms appear in the shot text gets swapped for
 * its <<<higgsfield_element_id>>> placeholder, locking identity and set.
 */

export interface RegistryElement {
  kind: "character" | "prop" | "outfit" | "environment";
  name: string;
  elementId: string;
  /** words/phrases in shot text that trigger the placeholder swap */
  matchTerms: string[];
  /** continuity job description, e.g. "the pastel-pink princess phone in every shot" */
  description?: string;
}

export interface ShotPrompt {
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  actionDescription: string;
  mood: string;
  dialogue?: string;
  durationSeconds: number;
  aspectRatio: string;
  productionNotes?: string;
  elements: RegistryElement[];
  /** environment element for the scene's location (set lock) */
  locationElementId?: string | null;
  /** characters scripted in the shot (for cast-note fallback) */
  charactersInShot: string[];
}

const STABILITY_SUFFIX =
  "Avoid jitter. Face stable, no deformation. Natural smooth movements. Stable picture.";
const NEGATIVE_CONSTRAINTS =
  "No subtitles, no text overlay, no captions, no watermarks, no logos, no UI elements. No waxy CGI, no video-game render.";

/** Default technical preamble; production_notes can override the grade. */
function technicalPreamble(productionNotes?: string): string {
  const directive = (productionNotes || "").trim();
  return [
    `Live-action cinematic footage, ARRI Alexa 35, anamorphic prime lens, shallow depth of field, soft halation, subtle film grain.`,
    NEGATIVE_CONSTRAINTS,
    directive ? `PRODUCTION DIRECTIVE (locked): ${directive}` : "",
  ].filter(Boolean).join(" ");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Swap element match-terms in text for <<<element_id>>> placeholders.
 * Longest terms first so "Donna's bedroom" wins over "Donna". Returns the
 * rewritten text plus which elements fired.
 */
export function applyElementPlaceholders(
  text: string,
  elements: RegistryElement[]
): { text: string; used: RegistryElement[] } {
  const used: RegistryElement[] = [];
  // Flatten (element, term) pairs and sort by term length desc
  const pairs = elements
    .flatMap((el) => el.matchTerms.map((term) => ({ el, term })))
    .filter((p) => p.term.trim().length > 1)
    .sort((a, b) => b.term.length - a.term.length);

  let out = text;
  for (const { el, term } of pairs) {
    if (out.includes(`<<<${el.elementId}>>>`)) {
      if (!used.includes(el)) used.push(el);
      continue;
    }
    const re = new RegExp(`\\b${escapeRe(term)}(?:'s)?\\b`, "gi");
    if (re.test(out)) {
      out = out.replace(re, (m) =>
        m.toLowerCase().endsWith("'s") ? `<<<${el.elementId}>>>'s` : `<<<${el.elementId}>>>`
      );
      if (!used.includes(el)) used.push(el);
    }
  }
  return { text: out, used };
}

/** Camera line per PROMPTING.md vocabulary. */
function cameraLine(shotType: string, cameraAngle: string, cameraMovement: string): string {
  const framing = [shotType || "medium shot", cameraAngle && cameraAngle !== "eye-level" ? cameraAngle : ""]
    .filter(Boolean)
    .join(", ");
  const move =
    cameraMovement && cameraMovement !== "static"
      ? `${cameraMovement} over the duration of the shot`
      : "locked-off static shot with subtle natural motion";
  return `${framing ? `Framing: ${framing}. ` : ""}Camera: ${move}.`;
}

/**
 * Build the full house-structure prompt for one shot.
 */
export function buildShotPrompt(shot: ShotPrompt): string {
  // 1. Placeholder swaps in the action text
  const { text: action, used } = applyElementPlaceholders(shot.actionDescription, shot.elements);

  // Characters scripted in the shot but never named in the action still get
  // identity-anchored via an explicit cast note.
  const unmentioned = shot.elements.filter(
    (el) =>
      el.kind === "character" &&
      !used.includes(el) &&
      shot.charactersInShot.some((n) => el.matchTerms.some((t) => t.toLowerCase() === n.toLowerCase()))
  );
  const castNote =
    unmentioned.length > 0
      ? ` In shot: ${unmentioned.map((el) => `<<<${el.elementId}>>> (${el.name})`).join(", ")}.`
      : "";
  const setNote = shot.locationElementId
    ? ` Set: <<<${shot.locationElementId}>>> — same set dressing and layout as the reference, no redesign.`
    : "";

  const visuals = [
    `VISUALS: ${cameraLine(shot.shotType, shot.cameraAngle, shot.cameraMovement)}`,
    `${action}.${castNote}${setNote}`,
    shot.mood ? `Mood: ${shot.mood}.` : "",
  ].filter(Boolean).join(" ");

  // 2. Dialogue (speaker-attributed lines render as speech with lip sync)
  const dialogue = (shot.dialogue || "").trim();
  const dialogueBlock = `DIALOGUE / SPOKEN AUDIO:\n${dialogue || "No dialogue in this shot."}`;

  // 3. Continuity invariants — explicit invariants beat implied ones.
  const allUsed = [...used, ...unmentioned];
  const elementRules = allUsed
    .filter((el) => el.description)
    .map((el) => el.description)
    .join(" ");
  const continuity = [
    `CONTINUITY RULES: Same outfit first frame to last frame, no wardrobe changes.`,
    shot.locationElementId ? `Same set as the environment reference — walls, furniture, layout identical.` : "",
    elementRules,
    `Avoid identity drift. Consistent appearance across all beats.`,
    STABILITY_SUFFIX,
  ].filter(Boolean).join(" ");

  return [
    technicalPreamble(shot.productionNotes),
    visuals,
    dialogueBlock,
    continuity,
    `Total: ${Math.min(15, Math.max(4, Math.round(shot.durationSeconds || 5)))}s / 1 shot / ${shot.aspectRatio}`,
  ].join("\n\n");
}

/**
 * Multi-shot sequence prompt (Seedance ≤15s): numbered shots, one action
 * verb per beat, escalation arc, shared continuity + metadata footer.
 */
export function buildSequencePrompt(
  shots: Array<Pick<ShotPrompt, "shotType" | "cameraMovement" | "actionDescription" | "dialogue">>,
  shared: Omit<ShotPrompt, "shotType" | "cameraAngle" | "cameraMovement" | "actionDescription" | "dialogue">
): string {
  const totalDuration = Math.min(15, Math.max(4, Math.round(shared.durationSeconds)));
  const lines: string[] = [];
  const allUsed: RegistryElement[] = [];

  shots.forEach((s, i) => {
    const { text, used } = applyElementPlaceholders(s.actionDescription, shared.elements);
    for (const u of used) if (!allUsed.includes(u)) allUsed.push(u);
    const move = s.cameraMovement && s.cameraMovement !== "static" ? ` ${s.cameraMovement}.` : " Static.";
    lines.push(`Shot ${i + 1}: ${s.shotType || "Medium"} — ${text}.${move}`);
  });

  const dialogueLines = shots.map((s) => (s.dialogue || "").trim()).filter(Boolean);
  const dialogueBlock = `DIALOGUE / SPOKEN AUDIO:\n${dialogueLines.length ? dialogueLines.join("\n") : "No dialogue in this sequence."}`;

  const setNote = shared.locationElementId
    ? `Set: <<<${shared.locationElementId}>>> — same set dressing across all shots.`
    : "";
  const elementRules = allUsed.filter((el) => el.description).map((el) => el.description).join(" ");

  return [
    technicalPreamble(shared.productionNotes),
    `VISUALS:\n${lines.join("\n")}`,
    setNote,
    dialogueBlock,
    `CONTINUITY RULES: Same outfits and set across every shot, no wardrobe changes. ${elementRules} Avoid identity drift. Consistent appearance across all beats. ${STABILITY_SUFFIX}`,
    `Total: ${totalDuration}s / ${shots.length} shots / ${shared.aspectRatio}`,
  ].filter(Boolean).join("\n\n");
}
