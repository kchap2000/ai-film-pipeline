import Anthropic from "@anthropic-ai/sdk";

const EXTRACTION_SYSTEM_PROMPT = `You are a professional script analyst and film production assistant. Your job is to read scripts, treatments, director notes, or any film production documents and extract structured production data.

You MUST respond with valid JSON only — no markdown, no commentary, no code fences. Your entire response must be parseable by JSON.parse().

---

SCENE GROUPING RULES (critical):
Scripts come in two formats. Detect which format you have and handle accordingly:

A) TRADITIONAL FORMAT (INT./EXT. scene headings): Each heading = one scene.
B) NUMBERED-SHOT FORMAT (numbered shots like "1.", "2.", "3."): Group consecutive shots that share the same location and time-of-day into ONE scene. Do NOT create a separate scene per shot — group them. A scene break happens when the location OR time-of-day changes significantly, or when there is a major narrative shift (e.g. reality → dream, or a clear CUT TO:). Aim for 4–8 scenes per typical short script, not one per shot.

---

Extract the following:

1. **characters** — every speaking or physically present character. This INCLUDES non-human creatures, monsters, and animals with significant on-screen presence (a dragon, a beast, a robot): they must be cast and locked visually exactly like human characters. For each:
   - "name": string — the character's name as written
   - "description": string — ALL physical details mentioned: age, approximate age range, ethnicity, hair, build, distinguishing features. If the script provides NO physical details, write exactly: "No physical description provided in script — awaiting production notes." RELATIONSHIP PRECISION: when describing a character's relationship to others, use the EXACT term the script uses (e.g. "husband", "wife", "boyfriend", "girlfriend", "partner", "ex"). Do NOT substitute a looser term. If the script refers to "his wife" or "her husband", write "husband" or "wife" — never default to "boyfriend" or "girlfriend". If relationship is ambiguous, write "partner" or describe what's shown without labeling.
   - "role": one of "lead", "supporting", "minor", "extra", "mentioned"
   - "personality": string — personality traits, demeanor, emotional arc
   - "voice_only": boolean — true if this character ONLY appears as a voice (V.O., O.S., phone recording, narration) and is never physically present on screen; false otherwise

2. **scenes** — grouped scenes (apply scene grouping rules above). For each:
   - "scene_number": number — sequential (1, 2, 3...)
   - "location": string — where the scene takes place (clean name, e.g. "Donna's Bedroom")
   - "time_of_day": one of "day", "night", "dawn", "dusk", "morning", "afternoon", "golden hour"
   - "scene_type": one of "real", "dream", "fantasy", "flashback", "montage" — use "dream" or "fantasy" if the script notes soft edges, dream-like quality, or explicitly labels it as imagined/fantasy
   - "action_summary": string — 2-4 sentences covering the full scene's dramatic content
   - "mood": string — emotional tone (e.g. "intimate", "tense", "comedic", "melancholy")
   - "props": string[] — notable props
   - "wardrobe": object[] — { "character": string, "description": string } for wardrobe mentions
   - "characters_present": string[] — names of characters physically present (exclude V.O.-only characters)

3. **locations** — unique production locations derived from the scenes. For each:
   - "name": string — clean location name, matching scene.location where possible
   - "description": string — concrete visual production description using only evidence from the document: architecture, set dressing, geography, lighting cues, atmosphere, practical constraints. If the document gives no details, write exactly: "No visual location description provided in script — awaiting production notes."
   - "time_of_day": string — best default time from scenes using this location
   - "mood": string — dominant mood from scenes using this location

4. **structure**:
   - "acts": array of { "act_number": number, "title": string|null, "description": string, "scene_range": [start, end] }
   - "episode_title": string | null
   - "genre": string
   - "logline": string — one punchy sentence
   - "themes": string[]

5. **setting_profile** — the world's physical rules, enforced in every generated image. Derive from the script's era, technology, and genre:
   - "era": string — e.g. "medieval high fantasy", "1992 American suburb", "near-future Mars colony"
   - "technology_level": string — what exists in this world (e.g. "pre-gunpowder: swords, catapults, torches, magic")
   - "wardrobe_rules": string[] — what characters wear in this world (materials, silhouettes, period cues)
   - "forbidden": string[] — CONCRETE anachronisms that must NEVER appear. Be exhaustive for the era, e.g. for medieval fantasy: ["modern military gear / tactical vests / camouflage", "firearms", "zippers, velcro, plastics", "wristwatches, eyeglasses with modern frames", "contemporary haircuts/products", "cars, power lines, modern buildings", "printed text, logos"]

If information is absent, use null or [] — never invent. Apply scene grouping strictly.

Output format:
{
  "characters": [...],
  "scenes": [...],
  "locations": [...],
  "structure": { "acts": [...], "episode_title": ..., "genre": ..., "logline": ..., "themes": [...] },
  "setting_profile": { "era": ..., "technology_level": ..., "wardrobe_rules": [...], "forbidden": [...] }
}`;

export interface ExtractedCharacter {
  name: string;
  description: string;
  role: "lead" | "supporting" | "minor" | "extra" | "mentioned";
  personality: string;
  voice_only: boolean;
}

export interface SceneWardrobe {
  character: string;
  description: string;
}

export interface ExtractedScene {
  scene_number: number;
  location: string;
  time_of_day: string;
  scene_type: "real" | "dream" | "fantasy" | "flashback" | "montage";
  action_summary: string;
  mood: string;
  props: string[];
  wardrobe: SceneWardrobe[];
  characters_present: string[];
}

export interface ExtractedLocation {
  name: string;
  description: string;
  time_of_day: string;
  mood: string;
}

export interface ExtractedStructure {
  acts: {
    act_number: number;
    title: string | null;
    description: string;
    scene_range: [number, number];
  }[];
  episode_title: string | null;
  genre: string;
  logline: string;
  themes: string[];
}

export interface SettingProfile {
  era: string;
  technology_level: string;
  wardrobe_rules: string[];
  forbidden: string[];
}

export interface ExtractionResult {
  characters: ExtractedCharacter[];
  scenes: ExtractedScene[];
  locations?: ExtractedLocation[];
  structure: ExtractedStructure;
  setting_profile?: SettingProfile;
}

export async function extractFromText(
  documentText: string
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });

  // max_tokens 16000 (was 8192): a rich script's full extraction — characters +
  // 8 scenes + locations + structure + setting_profile — overran 8192 and the
  // JSON came back truncated. And Claude intermittently emits slightly invalid
  // JSON, so we retry the whole call up to 2× on a parse failure instead of
  // hard-failing the run. (Found in the "We Bought a Bar" Ep1 test run.)
  let lastRaw = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Please analyze the following document(s) and extract all characters, scenes, and structure as specified.\n\n---\n\n${documentText}`,
        },
      ],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    lastRaw = responseText;
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      return JSON.parse(cleaned) as ExtractionResult;
    } catch {
      if (message.stop_reason === "max_tokens") {
        console.error(`extractFromText: response truncated at max_tokens (attempt ${attempt})`);
      } else {
        console.error(`extractFromText: JSON parse failed (attempt ${attempt})`);
      }
      // fall through to retry
    }
  }

  throw new Error(
    `Failed to parse extraction response as JSON after 3 attempts. Raw response: ${lastRaw.slice(0, 500)}`
  );
}
