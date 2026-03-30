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

1. **characters** — every speaking or physically present character. For each:
   - "name": string — the character's name as written
   - "description": string — ALL physical details mentioned: age, approximate age range, ethnicity, hair, build, distinguishing features. If the script provides NO physical details, write exactly: "No physical description provided in script — awaiting production notes."
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

3. **structure**:
   - "acts": array of { "act_number": number, "title": string|null, "description": string, "scene_range": [start, end] }
   - "episode_title": string | null
   - "genre": string
   - "logline": string — one punchy sentence
   - "themes": string[]

If information is absent, use null or [] — never invent. Apply scene grouping strictly.

Output format:
{
  "characters": [...],
  "scenes": [...],
  "structure": { "acts": [...], "episode_title": ..., "genre": ..., "logline": ..., "themes": [...] }
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

export interface ExtractionResult {
  characters: ExtractedCharacter[];
  scenes: ExtractedScene[];
  structure: ExtractedStructure;
}

export async function extractFromText(
  documentText: string
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Please analyze the following document(s) and extract all characters, scenes, and structure as specified.\n\n---\n\n${documentText}`,
      },
    ],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Strip markdown code fences if Claude adds them despite instructions
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as ExtractionResult;
    return parsed;
  } catch {
    throw new Error(
      `Failed to parse extraction response as JSON. Raw response: ${responseText.slice(0, 500)}`
    );
  }
}
