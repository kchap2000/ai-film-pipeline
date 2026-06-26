/**
 * build-higgsfield-prompt.ts
 *
 * Constructs Higgsfield-ready labeled-section prompts for storyboard panels,
 * following the video prompting framework's spec-sheet structure.
 *
 * Higgsfield is a router — prompt to the target engine's conventions.
 * For nano_banana_2 (image gen), use the Segmind/Higgsfield keyframe format:
 *   Shot type & subject | Camera framing & angle | Lighting | Environment | Lens/film | Mood
 *
 * Elements are referenced by @handle directly in prompt text.
 * Higgsfield resolves them automatically against trained identity models.
 *
 * Model selection:
 *   - nano_banana_2: Character + scene generation with Elements (PRIMARY)
 *   - gpt_image_2: Typography, graphics, general purpose
 *   - soul_cinema: Cinematic stills (no element support)
 *
 * NEVER use: soul_2, text2image_soul_v2 (standing rule — quality unacceptable)
 */

export interface ElementInfo {
  elementId: string;      // UUID
  elementName: string;    // e.g., "Khalil4.26" — becomes @Khalil4.26 in prompt
  category: "character" | "environment" | "prop";
  description?: string;   // Element description from Higgsfield
}

export interface PanelData {
  panelId: string;
  sceneNumber: number;
  shotNumber: number;
  shotType: string;        // e.g., "WIDE", "MEDIUM", "CLOSE-UP"
  cameraAngle: string;     // e.g., "eye level", "low angle", "high angle"
  cameraMovement?: string; // e.g., "static", "slow push", "tracking"
  description: string;     // Claude's shot description
  dialogueLine?: string;
  emotion?: string;
  mood?: string;           // Scene mood from extraction
  timeOfDay?: string;      // e.g., "golden hour", "midday", "dusk"
  charactersInShot: string[];  // character names
  locationName: string;
}

export interface HiggsfieldPromptResult {
  prompt: string;
  model: string;
  aspectRatio: string;
  elementHandles: string[];    // e.g., ["@Khalil4.26", "@Nicole"]
  hasCharacterElements: boolean;
  hasLocationElement: boolean;
  routeToHiggsfield: boolean;  // true if ANY character has an element
}

// ── Camera vocabulary (from framework.md §4) ─────────────────────────

/** Map panel shot types to precise camera language. */
const SHOT_SIZE_MAP: Record<string, string> = {
  "EXTREME WIDE":      "Extreme wide shot (EWS)",
  "WIDE":              "Wide shot (WS)",
  "FULL":              "Full shot",
  "MEDIUM WIDE":       "Medium wide shot",
  "MEDIUM":            "Medium shot (MS), waist up",
  "MEDIUM CLOSE-UP":   "Medium close-up (MCU), chest up",
  "CLOSE-UP":          "Close-up (CU)",
  "EXTREME CLOSE-UP":  "Extreme close-up (ECU)",
  "OVER THE SHOULDER": "Over-the-shoulder (OTS)",
  "TWO-SHOT":          "Two-shot",
  "POV":               "POV / first-person",
  "INSERT":            "Insert detail shot",
  "AERIAL":            "Drone flyover, top-down",
};

/** Map camera angle descriptions to framework vocabulary. */
const ANGLE_MAP: Record<string, string> = {
  "eye level":   "eye level",
  "low angle":   "low angle (power/presence)",
  "high angle":  "high angle (vulnerability)",
  "dutch":       "Dutch angle (unsettling)",
  "overhead":    "top-down / overhead",
  "top-down":    "top-down / overhead",
};

/** Map camera movement descriptions to framework vocabulary. */
const MOVEMENT_MAP: Record<string, string> = {
  "static":       "Camera static, locked off",
  "slow push":    "Slow dolly in (push)",
  "push in":      "Slow dolly in (push)",
  "pull out":     "Dolly out (pull), reveal",
  "tracking":     "Tracking shot, camera follows alongside",
  "pan left":     "Slow pan left",
  "pan right":    "Slow pan right",
  "tilt up":      "Slow tilt up",
  "tilt down":    "Slow tilt down",
  "crane up":     "Crane up, end high",
  "crane down":   "Crane down",
  "orbit":        "Slow arc / half orbit",
  "handheld":     "Handheld, organic slight jitter",
  "steadicam":    "Steadicam walk, smooth follow",
  "whip pan":     "Whip pan",
};

// ── LOLM Production Spec ──────────────────────────────────────────────

/**
 * Global style line for LOLM — baked from production_notes.
 * Follows framework rule: named lens + named light + color palette + film stock.
 * Replaces generic "cinematic" with concrete cues.
 */
const LOLM_STYLE_LINE = [
  "35mm anamorphic, Cooke S5/i lens, ARRI Alexa 35",
  "Kodak Vision3 500T film grain, shallow depth of field",
  "palette of sun-bleached timber, turquoise Caribbean water, golden hour amber, deep shadow teal",
  "2.39:1 anamorphic framing",
].join(". ");

/**
 * LOLM-specific negative block — 5 stability negatives.
 * Follows framework: specific, not generic. No contradiction with positive.
 */
const LOLM_NEGATIVES = [
  "no facial warping",
  "no identity drift between frames",
  "no modern architecture or concrete buildings",
  "no text overlays or watermarks",
  "no over-texturing or visual clutter",
].join(", ");

/**
 * LOLM lighting recipes by time of day.
 * Framework §6: name direction + source for depth.
 */
const LIGHTING_BY_TIME: Record<string, string> = {
  "golden hour":  "Golden hour key light from camera-left, warm tungsten fill bouncing off weathered wood, long amber shadows. Soft rim light from the low Caribbean sun.",
  "midday":       "Hard overhead Caribbean sun, deep shadows under the palapa roof. Motivated fill from ocean reflection. High contrast, vivid saturation.",
  "morning":      "Soft dawn light from the east, cool blue shadows, warm highlights on skin. Gentle volumetric mist off the ocean.",
  "dusk":         "Last light, deep amber key from horizon-left. Cool blue-purple fill from the sky. Silhouette potential on figures against the ocean.",
  "night":        "Warm practical light from string lights and bare bulbs inside The Driftwood. Cool moonlight rim from behind. Intimate, low-key.",
  "overcast":     "Soft diffused overhead, no harsh shadows. Ocean provides subtle fill. Muted but warm color palette.",
};

// ── Prompt Builder ────────────────────────────────────────────────────

/**
 * Build a Higgsfield-ready labeled-section prompt for a storyboard panel.
 *
 * Uses the video prompting framework's spec-sheet structure:
 *   REFERENCE USAGE → SETTING → SHOT → SUBJECT → CAMERA → LIGHTING → STYLE → NEGATIVE → FORMAT
 *
 * Identity locking happens through @element handles (trained models)
 * PLUS reinforcement phrasing from the framework's lock blocks.
 *
 * @param panel - Panel data from storyboard_panels table
 * @param characterElements - Map of character name (UPPERCASE) → ElementInfo
 * @param locationElements - Map of location name → ElementInfo
 * @param propElements - Optional map of prop name → ElementInfo
 * @returns HiggsfieldPromptResult with structured prompt and routing decision
 */
export function buildHiggsfieldPrompt(
  panel: PanelData,
  characterElements: Map<string, ElementInfo>,
  locationElements: Map<string, ElementInfo>,
  propElements?: Map<string, ElementInfo>,
): HiggsfieldPromptResult {
  const elementHandles: string[] = [];
  let hasCharacterElements = false;
  let hasLocationElement = false;

  // ── Resolve elements ────────────────────────────────────────────
  const charHandles: string[] = [];
  const charDescriptions: string[] = [];
  for (const charName of panel.charactersInShot) {
    const el = characterElements.get(charName.toUpperCase());
    if (el) {
      const handle = `@${el.elementName}`;
      elementHandles.push(handle);
      charHandles.push(handle);
      hasCharacterElements = true;
      if (el.description) {
        charDescriptions.push(`${handle}: ${el.description}`);
      }
    } else {
      charHandles.push(charName);
    }
  }

  let locationHandle = panel.locationName;
  const locEl = locationElements.get(panel.locationName);
  if (locEl) {
    locationHandle = `@${locEl.elementName}`;
    elementHandles.push(locationHandle);
    hasLocationElement = true;
  }

  // ── Resolve camera vocabulary ───────────────────────────────────
  const shotSize = SHOT_SIZE_MAP[panel.shotType.toUpperCase()] || panel.shotType;
  const angle = ANGLE_MAP[panel.cameraAngle?.toLowerCase()] || panel.cameraAngle || "eye level";
  const movement = MOVEMENT_MAP[panel.cameraMovement?.toLowerCase() || "static"]
    || panel.cameraMovement || "Camera static, locked off";

  // ── Resolve lighting ────────────────────────────────────────────
  const timeKey = (panel.timeOfDay || "golden hour").toLowerCase();
  const lighting = LIGHTING_BY_TIME[timeKey] || LIGHTING_BY_TIME["golden hour"];

  // ── Build labeled sections ──────────────────────────────────────
  const sections: string[] = [];

  // REFERENCE USAGE — identity locking through Elements
  if (hasCharacterElements) {
    const lockLines = [
      `REFERENCE USAGE: ${charHandles.join(" and ")} — trained identity elements.`,
      "Preserve exact facial structure, skin tone, hairstyle, and build from the element reference.",
      "Do NOT regenerate, beautify, smooth, or stylize any face.",
      "Cinematic and lighting effects apply to environment and clothing only, not faces.",
    ];
    if (charDescriptions.length > 0) {
      lockLines.push(charDescriptions.join(". ") + ".");
    }
    sections.push(lockLines.join(" "));
  }

  // SETTING — location, time of day, era
  sections.push(
    `SETTING: ${locationHandle}, ${panel.timeOfDay || "golden hour"}. ` +
    "Costa Rica, 2010. Rustic Caribbean beach architecture — " +
    "weathered timber, rope railings, hand-painted signage, thatched palapa roof."
  );

  // SHOT — shot size + angle (separated from camera movement per framework rule)
  sections.push(
    `SHOT: ${shotSize}, ${angle}.`
  );

  // SUBJECT — characters + action, one consistent noun per character
  const actionDesc = trimToBeats(panel.description, 40);
  if (charHandles.length > 0) {
    sections.push(
      `SUBJECT: ${charHandles.join(" and ")}. ${actionDesc}`
    );
  } else {
    sections.push(
      `SUBJECT: ${actionDesc}`
    );
  }

  // Emotion/mood beat (the visible symptom, not the feeling — framework §acting)
  if (panel.emotion) {
    sections.push(`MOOD: ${panel.emotion}${panel.mood ? ". " + panel.mood : ""}.`);
  }

  // CAMERA MOVEMENT — one primary axis, on its own line
  sections.push(`CAMERA: ${movement}.`);

  // LIGHTING — named direction + source
  sections.push(`LIGHTING: ${lighting}`);

  // VIDEO STYLE — global style line (named lens + film stock + palette)
  sections.push(`STYLE: ${LOLM_STYLE_LINE}.`);

  // NEGATIVE — 3-5 specific stability negatives
  sections.push(`NEGATIVE: ${LOLM_NEGATIVES}.`);

  // FORMAT — aspect ratio
  sections.push("FORMAT: 16:9, single keyframe, 4K.");

  const prompt = sections.join("\n");

  // ── Routing decision ────────────────────────────────────────────
  // Route to Higgsfield if ANY character has a trained element.
  // Environment-only shots stay with Gemini (9-10/10 on environments).
  const routeToHiggsfield = hasCharacterElements;

  return {
    prompt,
    model: "nano_banana_2",
    aspectRatio: "16:9",
    elementHandles,
    hasCharacterElements,
    hasLocationElement,
    routeToHiggsfield,
  };
}

/**
 * Trim description to roughly N words, keeping it to actionable beats.
 * Framework rule: one beat = one camera position + one action + one mood detail.
 */
function trimToBeats(desc: string, maxWords: number): string {
  const words = desc.split(/\s+/);
  if (words.length <= maxWords) return desc;
  const truncated = words.slice(0, maxWords).join(" ");
  // End at a natural sentence break if possible
  const lastPeriod = truncated.lastIndexOf(".");
  const lastComma = truncated.lastIndexOf(",");
  const breakPoint = Math.max(lastPeriod, lastComma);
  if (breakPoint > truncated.length * 0.4) {
    return truncated.slice(0, breakPoint + 1);
  }
  return truncated + "...";
}

/**
 * Categorize all panels into Higgsfield vs. Gemini routing.
 *
 * @returns Two arrays: higgsfieldPanels (character shots) and geminiPanels (environment only)
 */
export function categorizePanels(
  panels: PanelData[],
  characterElements: Map<string, ElementInfo>,
  locationElements: Map<string, ElementInfo>,
  propElements?: Map<string, ElementInfo>,
): {
  higgsfieldPanels: Array<{ panel: PanelData; prompt: HiggsfieldPromptResult }>;
  geminiPanels: PanelData[];
  summary: { total: number; higgsfield: number; gemini: number };
} {
  const higgsfieldPanels: Array<{ panel: PanelData; prompt: HiggsfieldPromptResult }> = [];
  const geminiPanels: PanelData[] = [];

  for (const panel of panels) {
    const result = buildHiggsfieldPrompt(panel, characterElements, locationElements, propElements);
    if (result.routeToHiggsfield) {
      higgsfieldPanels.push({ panel, prompt: result });
    } else {
      geminiPanels.push(panel);
    }
  }

  return {
    higgsfieldPanels,
    geminiPanels,
    summary: {
      total: panels.length,
      higgsfield: higgsfieldPanels.length,
      gemini: geminiPanels.length,
    },
  };
}

/**
 * Generate an example prompt for a LOLM panel to verify the format.
 * Useful for testing the builder without DB data.
 */
export function exampleLOLMPrompt(): HiggsfieldPromptResult {
  const charElements = new Map<string, ElementInfo>([
    ["KHALIL", {
      elementId: "3dadc9be-05cc-48f6-b34c-141500ec9cb4",
      elementName: "Khalil4.26",
      category: "character",
      description: "African American male, 24 years old, medium-dark skin, low fade",
    }],
    ["NICOLE", {
      elementId: "5ab95090-56d9-458b-a572-8dfbc7cfa9e9",
      elementName: "Nicole",
      category: "character",
      description: "African American woman, warm brown skin, shoulder-length curls",
    }],
  ]);

  const locElements = new Map<string, ElementInfo>([
    ["The Driftwood - Exterior and Interior", {
      elementId: "09321d18-fca6-46bf-9a14-60ed9fef1a1a",
      elementName: "The-Driftwood-NewExterior",
      category: "environment",
    }],
  ]);

  const examplePanel: PanelData = {
    panelId: "example",
    sceneNumber: 3,
    shotNumber: 1,
    shotType: "WIDE",
    cameraAngle: "low angle",
    cameraMovement: "slow push",
    description: "Khalil and Nicole stand at the threshold of The Driftwood for the first time, staring up at the decrepit two-story bar. Nicole's hand finds Khalil's arm. The hand-painted sign creaks in the ocean breeze above them.",
    emotion: "Eyes wide with disbelief, a slow exhale, then the faintest grin — they see past the ruin",
    mood: "wonder mixed with trepidation",
    timeOfDay: "golden hour",
    charactersInShot: ["KHALIL", "NICOLE"],
    locationName: "The Driftwood - Exterior and Interior",
  };

  return buildHiggsfieldPrompt(examplePanel, charElements, locElements);
}
