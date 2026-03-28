import Anthropic from "@anthropic-ai/sdk";

const EXTRACTION_SYSTEM_PROMPT = `You are a professional script analyst and film production assistant. Your job is to read scripts, treatments, director notes, or any film production documents and extract structured data from them.

You MUST respond with valid JSON only — no markdown, no commentary, no code fences. Your entire response must be parseable by JSON.parse().

Extract the following from the provided document(s):

1. **characters** — an array of every character mentioned. For each:
   - "name": string — the character's name
   - "description": string — physical appearance, distinguishing features, age range, ethnicity if stated
   - "role": string — one of "lead", "supporting", "minor", "extra", "mentioned"
   - "personality": string — personality traits, demeanor, arc notes

2. **scenes** — an array of every scene or distinct location-moment. For each:
   - "scene_number": number — sequential order (starting at 1)
   - "location": string — where the scene takes place
   - "time_of_day": string — e.g. "day", "night", "dawn", "dusk", "morning", "afternoon"
   - "action_summary": string — 1-3 sentence summary of what happens
   - "mood": string — emotional tone of the scene (e.g. "tense", "romantic", "chaotic")
   - "props": string[] — notable props or objects in the scene
   - "wardrobe": object[] — array of { "character": string, "description": string } for any wardrobe mentions
   - "characters_present": string[] — names of characters in this scene

3. **structure** — episode/act breakdown:
   - "acts": array of { "act_number": number, "title": string (if any), "description": string, "scene_range": [start, end] }
   - "episode_title": string | null
   - "genre": string
   - "logline": string — one-sentence summary of the entire piece
   - "themes": string[] — major themes

If information is not present in the document, use null or empty arrays — never invent details.

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
}

export interface SceneWardrobe {
  character: string;
  description: string;
}

export interface ExtractedScene {
  scene_number: number;
  location: string;
  time_of_day: string;
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
    model: "claude-sonnet-4-5-20250514",
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
