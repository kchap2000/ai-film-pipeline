/**
 * Cinematic prompt engine — encodes PROMPTING.md + the seedance-prompting
 * skill (Skills Library/seedance-prompting). Read those first.
 *
 * Builds DIRECTOR-GRADE Seedance video prompts for dramatic narrative beats.
 * The five laws (seedance SKILL §0) every prompt obeys:
 *   1. State shot structure FIRST  (SCENE: … N shots / Xs / 9:16)
 *   2. Write on a TIMELINE         (numbered shots, each with its own seconds)
 *   3. Give every reference a JOB   (ELEMENTS block: <<<id>>> = set/identity/prop)
 *   4. Emotion = PHYSICAL ACTION    (carried from the shot breakdown verbs)
 *   5. Say what the camera is NOT   (one move per shot; "static, locked off")
 * …plus SOUND (default "No music, no score."), a generated QA GATE, and the
 * NEGATIVES block LAST (dramatic-realism + per-era anachronism set).
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
  // ── Director-grade enrichments (optional; degrade gracefully) ──
  /** one-line look/setting for the SCENE header (else derived from mood) */
  sceneLook?: string;
  /** where characters are relative to each other; eyelines */
  blocking?: string;
  /** the one physical object that carries the scene's subtext */
  subtextObject?: string;
  /** room tone / ambient sound bed for the SOUND block */
  roomTone?: string;
  /** era anachronisms → appended to the NEGATIVES block */
  forbidden?: string[];
}

/** One beat in a multi-shot sequence. */
export interface SequenceShot {
  shotType: string;
  cameraAngle?: string;
  cameraMovement: string;
  actionDescription: string;
  dialogue?: string;
  /** this beat's own screen time (else the scene duration is distributed) */
  durationSeconds?: number;
}

const LOOK_STOCK =
  "Shot on ARRI Alexa 35, anamorphic prime lens, photorealistic live-action, shallow depth of field, soft halation, organic film grain.";

const STABILITY_SUFFIX =
  "Faces stable, no deformation, no jitter; natural smooth movement; consistent appearance across every beat.";

/** Dramatic-realism negatives (seedance SKILL §4) — go in the FINAL block. */
const DRAMATIC_NEGATIVES = [
  "no facial warping",
  "no identity drift between shots",
  "no over-acting or theatrical mugging",
  "no smiling unless directed",
  "no extra limbs or hand glitches",
  "no subtitles, text overlays, captions, or watermarks",
  "no waxy CGI or video-game render",
];

function negativesBlock(forbidden?: string[]): string {
  const anachronism =
    forbidden && forbidden.length
      ? `no ${forbidden.map((f) => f.trim()).filter(Boolean).join(", no ")}`
      : "no anachronistic wardrobe, props, or technology for the stated era";
  return `NEGATIVES: ${[...DRAMATIC_NEGATIVES, anachronism].join(", ")}.`;
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
    // Single-word terms match CASE-SENSITIVELY ("Ash" must not swallow
    // "blood and ash"); multi-word terms stay case-insensitive.
    const flags = term.trim().includes(" ") ? "gi" : "g";
    const re = new RegExp(`\\b${escapeRe(term)}(?:'s)?\\b`, flags);
    if (re.test(out)) {
      out = out.replace(re, (m) =>
        m.toLowerCase().endsWith("'s") ? `<<<${el.elementId}>>>'s` : `<<<${el.elementId}>>>`
      );
      if (!used.includes(el)) used.push(el);
    }
  }
  return { text: out, used };
}

/**
 * Element ranking + cap (~4 reference limit). Characters scripted in the
 * shot rank first; the location element reserves a slot (via reservedSlots).
 */
export const MAX_ACTIVE_ELEMENTS = 4;

export function rankAndCapElements(
  elements: RegistryElement[],
  charactersInShot: string[],
  reservedSlots = 0
): { active: RegistryElement[]; overflow: RegistryElement[] } {
  const inShot = new Set(charactersInShot.map((n) => n.toLowerCase()));
  const rank = (el: RegistryElement): number => {
    if (el.kind === "character") {
      return el.matchTerms.some((t) => inShot.has(t.toLowerCase())) ? 0 : 1;
    }
    if (el.kind === "prop") return 2;
    if (el.kind === "outfit") return 3;
    return 4; // extra environments — the location element covers the set
  };
  const sorted = [...elements].sort((a, b) => rank(a) - rank(b));
  const cap = Math.max(0, MAX_ACTIVE_ELEMENTS - reservedSlots);
  return { active: sorted.slice(0, cap), overflow: sorted.slice(cap) };
}

// ── Director-grade assembly helpers ──────────────────────────────

/** SCENE header — Law #1: structure (look + shots/duration/aspect) first. */
function sceneHeader(look: string | undefined, shotCount: number, totalSeconds: number, aspect: string): string {
  const lookClean = (look || "a dramatic narrative beat").trim().replace(/\.\s*$/, "");
  return `SCENE: Multi-shot cinematic — ${lookClean}. ${LOOK_STOCK} ${shotCount} shot${shotCount === 1 ? "" : "s"} / ${totalSeconds}s / ${aspect}.`;
}

function jobFor(el: RegistryElement): string {
  switch (el.kind) {
    case "character": return "identity + wardrobe lock";
    case "outfit": return "wardrobe lock";
    case "prop": return "continuity / subtext prop";
    default: return "set + environment lock";
  }
}

/** Law #3: give every reference a job. */
function elementsJobsBlock(active: RegistryElement[], locationElementId?: string | null): string {
  const lines = active.map((el) => `<<<${el.elementId}>>> (${el.name}) = ${jobFor(el)}`);
  if (locationElementId) lines.unshift(`<<<${locationElementId}>>> = set + environment lock`);
  if (!lines.length) return "";
  return `ELEMENTS (each has a job): ${lines.join(" · ")}.`;
}

function subjectsBlock(
  activeChars: RegistryElement[],
  mood?: string,
  blocking?: string,
  subtextObject?: string
): string {
  const who = activeChars.length
    ? activeChars.map((el) => (el.description ? `${el.name} — ${el.description}` : el.name)).join("; ")
    : "";
  const state = mood ? ` Emotional register: ${mood}.` : "";
  const block = blocking ? ` Blocking: ${blocking}.` : "";
  const obj = subtextObject
    ? ` Subtext object: ${subtextObject} — let it carry the tension, never explained.`
    : "";
  if (!who && !block && !obj) return "";
  return `SUBJECTS: ${who}.${state}${block}${obj}`.replace(/\s+\./g, ".").replace(/\.\./g, ".");
}

/** Law #5: one move per shot; name what the camera is NOT doing when still. */
function cap(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function cameraMove(movement?: string): string {
  const m = (movement || "").trim().toLowerCase();
  if (!m || m === "static") return "Static, locked off — no cuts, no zoom";
  return cap(movement!.replace(/-/g, " "));
}

/** Join element continuity notes into one readable, de-duplicated clause. */
function elementContinuity(els: RegistryElement[]): string {
  const notes = els
    .filter((el) => el.description)
    .map((el) => el.description!.trim().replace(/\.\s*$/, ""));
  return notes.length ? `Element continuity: ${Array.from(new Set(notes)).join("; ")}.` : "";
}

/** Default SOUND brief — room tone + lines + the locked "no music" rule. */
function soundBlock(dialogueLines: string[], roomTone?: string): string {
  const tone = (roomTone || "natural room tone, specific diegetic detail").trim();
  const lines = dialogueLines.length ? ` Lines: ${dialogueLines.join(" / ")}.` : "";
  return `SOUND: ${tone}.${lines} No music, no score.`;
}

/** Generated accept/reject checklist (seedance SKILL §1 QA GATE). */
function qaGate(
  activeChars: RegistryElement[],
  locationElementId: string | null | undefined,
  hasDialogue: boolean,
  forbidden?: string[]
): string {
  const checks: string[] = [];
  if (activeChars.length >= 2) checks.push(`${activeChars.length} distinct, consistent faces — no identity drift`);
  else if (activeChars.length === 1) checks.push(`${activeChars[0].name}'s face + wardrobe consistent across every shot`);
  checks.push("one camera move per shot; one CU reserved for the emotional peak");
  if (locationElementId) checks.push("same set, walls, and layout as the environment reference");
  checks.push("contained performance — emotion in eyes and breath, no mugging or unbidden smiling");
  if (forbidden && forbidden.length) checks.push(`period-accurate — ${forbidden.slice(0, 3).join(", ")} absent`);
  if (hasDialogue) checks.push("lines lip-synced and delivered as directed");
  checks.push("ends on the intended beat, not mid-action");
  return `QA GATE: • ${checks.join(" • ")}.`;
}

/** Distribute total screen time across N shots (rounded to 0.5s). */
function distributeSeconds(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = total / n;
  const arr = Array.from({ length: n }, () => Math.max(1, Math.round(base * 2) / 2));
  const sum = arr.reduce((a, b) => a + b, 0);
  arr[n - 1] = Math.max(1, +(arr[n - 1] + (total - sum)).toFixed(1));
  return arr;
}

function clampDuration(seconds: number): number {
  return Math.min(15, Math.max(4, Math.round(seconds || 5)));
}

/** Strip a "Shot N: " style leader if the breakdown wrote one into the action. */
function cleanAction(text: string): string {
  return text.trim().replace(/^shot\s*\d+\s*[:\-—]\s*/i, "").replace(/\.\s*$/, "");
}

/**
 * Build the full director-grade prompt for ONE shot.
 */
export function buildShotPrompt(shot: ShotPrompt): string {
  const { active, overflow } = rankAndCapElements(
    shot.elements,
    shot.charactersInShot,
    shot.locationElementId ? 1 : 0
  );

  const { text: action, used } = applyElementPlaceholders(cleanAction(shot.actionDescription), active);

  const unmentioned = active.filter(
    (el) =>
      el.kind === "character" &&
      !used.includes(el) &&
      shot.charactersInShot.some((n) => el.matchTerms.some((t) => t.toLowerCase() === n.toLowerCase()))
  );
  const activeChars = [...used, ...unmentioned].filter((el) => el.kind === "character");
  const castNote = unmentioned.length
    ? ` In shot: ${unmentioned.map((el) => `<<<${el.elementId}>>> (${el.name})`).join(", ")}.`
    : "";

  const secs = clampDuration(shot.durationSeconds);
  const framing = [shot.shotType || "medium shot", shot.cameraAngle && shot.cameraAngle !== "eye-level" ? shot.cameraAngle : ""]
    .filter(Boolean)
    .join(", ");
  const visual = `VISUALS:\nShot 1 (${secs}s): ${framing}. ${action}.${castNote} ${cameraMove(shot.cameraMovement)}.`;

  const dialogueLines = [(shot.dialogue || "").trim()].filter(Boolean);
  const continuity = [
    "CONTINUITY: same wardrobe and set first frame to last, no costume changes.",
    shot.locationElementId ? "Same set as the environment reference — walls, furniture, layout identical." : "",
    elementContinuity([...used, ...unmentioned, ...overflow]),
    STABILITY_SUFFIX,
  ].filter(Boolean).join(" ");

  return [
    sceneHeader(shot.sceneLook || shot.mood, 1, secs, shot.aspectRatio),
    shot.productionNotes?.trim() ? `STYLE & WORLD (locked): ${shot.productionNotes.trim()}` : "",
    elementsJobsBlock(active, shot.locationElementId),
    subjectsBlock(activeChars, shot.mood, shot.blocking, shot.subtextObject),
    visual,
    soundBlock(dialogueLines, shot.roomTone),
    continuity,
    qaGate(activeChars, shot.locationElementId, dialogueLines.length > 0, shot.forbidden),
    negativesBlock(shot.forbidden), // ← LAST, per house style
  ].filter(Boolean).join("\n\n");
}

/**
 * Multi-shot sequence prompt (Seedance ≤15s): SCENE header → ELEMENTS jobs →
 * SUBJECTS/blocking → numbered timeline (per-shot seconds + one camera move,
 * escalating calm → tension → peak → aftermath) → SOUND → CONTINUITY → QA
 * GATE → NEGATIVES last.
 */
export function buildSequencePrompt(
  shots: SequenceShot[],
  shared: Omit<ShotPrompt, "shotType" | "cameraAngle" | "cameraMovement" | "actionDescription" | "dialogue">
): string {
  const aspect = shared.aspectRatio;
  const totalDuration = clampDuration(shared.durationSeconds);

  const { active, overflow } = rankAndCapElements(
    shared.elements,
    shared.charactersInShot,
    shared.locationElementId ? 1 : 0
  );
  const activeChars = active.filter((el) => el.kind === "character");

  // Per-shot seconds: use the breakdown's values if every shot has one,
  // otherwise distribute the scene duration across the beats.
  const everyHasSecs = shots.length > 0 && shots.every((s) => typeof s.durationSeconds === "number" && s.durationSeconds! > 0);
  const secs = everyHasSecs
    ? shots.map((s) => Math.round((s.durationSeconds as number) * 10) / 10)
    : distributeSeconds(totalDuration, shots.length);

  const allUsed: RegistryElement[] = [];
  const visualLines = shots.map((s, i) => {
    const { text, used } = applyElementPlaceholders(cleanAction(s.actionDescription), active);
    for (const u of used) if (!allUsed.includes(u)) allUsed.push(u);
    const framing = [s.shotType || "Medium", s.cameraAngle && s.cameraAngle !== "eye-level" ? s.cameraAngle : ""]
      .filter(Boolean)
      .join(", ");
    return `Shot ${i + 1} (${secs[i]}s): ${framing}. ${text}. ${cameraMove(s.cameraMovement)}.`;
  });

  const dialogueLines = shots.map((s) => (s.dialogue || "").trim()).filter(Boolean);
  const continuity = [
    "CONTINUITY: same wardrobe and set across every shot, no costume changes.",
    shared.locationElementId ? "Same set as the environment reference across all shots." : "",
    elementContinuity([...allUsed, ...overflow]),
    STABILITY_SUFFIX,
  ].filter(Boolean).join(" ");

  return [
    sceneHeader(shared.sceneLook || shared.mood, shots.length, totalDuration, aspect),
    shared.productionNotes?.trim() ? `STYLE & WORLD (locked): ${shared.productionNotes.trim()}` : "",
    elementsJobsBlock(active, shared.locationElementId),
    subjectsBlock(activeChars, shared.mood, shared.blocking, shared.subtextObject),
    `VISUALS:\n${visualLines.join("\n")}`,
    soundBlock(dialogueLines, shared.roomTone),
    continuity,
    qaGate(activeChars, shared.locationElementId, dialogueLines.length > 0, shared.forbidden),
    negativesBlock(shared.forbidden), // ← LAST, per house style
  ].filter(Boolean).join("\n\n");
}
