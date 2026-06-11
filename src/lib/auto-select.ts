import Anthropic from "@anthropic-ai/sdk";

/**
 * Auto Mode best-of-N selection (FINAL_VISION.md — Auto-Selection Logic).
 *
 * Scores image variations against a textual brief using Claude Haiku vision
 * (fast + cheap), returns the winning variation. Used by the auto-pipeline
 * orchestrator at the casting, location, and scene-scout gates.
 */

export interface ScoredVariation {
  id: string;
  score: number;
  reasoning: string;
}

interface VariationInput {
  id: string;
  /** base64 data URL or HTTPS URL */
  imageUrl: string;
}

const SCORING_MODEL = "claude-haiku-4-5-20251001";

/** Convert an image reference into an Anthropic image content block. */
async function toImageBlock(
  imageUrl: string
): Promise<Anthropic.ImageBlockParam | null> {
  const dataMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (dataMatch) {
    const mediaType = dataMatch[1];
    // SVG placeholders can't be scored — and should never win
    if (mediaType.includes("svg")) return null;
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: dataMatch[2],
      },
    };
  }
  if (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
    return { type: "image", source: { type: "url", url: imageUrl } };
  }
  return null;
}

/**
 * Score one variation 1-10 against the brief. Returns 0 for unscoreable
 * images (SVG placeholders, broken URLs) so they never win.
 */
async function scoreOne(
  anthropic: Anthropic,
  brief: string,
  variation: VariationInput
): Promise<ScoredVariation> {
  const imageBlock = await toImageBlock(variation.imageUrl);
  if (!imageBlock) {
    return { id: variation.id, score: 0, reasoning: "Unscoreable image (placeholder or bad URL)" };
  }

  try {
    const response = await anthropic.messages.create({
      model: SCORING_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            imageBlock,
            {
              type: "text",
              text: `${brief}\n\nReturn ONLY valid JSON: {"score": <1-10>, "reasoning": "<one sentence>"}`,
            },
          ],
        },
      ],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { score?: number; reasoning?: string };
      const score = typeof parsed.score === "number" ? Math.max(0, Math.min(10, parsed.score)) : 0;
      return { id: variation.id, score, reasoning: parsed.reasoning || "" };
    }
  } catch (err) {
    console.error(`auto-select: scoring failed for ${variation.id}:`, err instanceof Error ? err.message : err);
  }
  return { id: variation.id, score: 0, reasoning: "Scoring failed" };
}

/**
 * Score all variations against a brief and return them sorted best-first.
 * Sequential (not parallel) to stay gentle on rate limits — N is small (≤10).
 */
export async function selectBest(
  brief: string,
  variations: VariationInput[]
): Promise<{ winner: ScoredVariation | null; all: ScoredVariation[] }> {
  if (variations.length === 0) return { winner: null, all: [] };

  const anthropic = new Anthropic();
  const scored: ScoredVariation[] = [];
  for (const v of variations) {
    scored.push(await scoreOne(anthropic, brief, v));
  }
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0] && scored[0].score > 0 ? scored[0] : scored[0] || null;
  return { winner, all: scored };
}

/** Casting brief (best of 10) */
// Every selected reference feeds video generation downstream — the most
// expensive step. The realism mandate (diagnostic v3) rides in every brief
// so illustration-style variations lose BEFORE money is spent animating.
const REALISM_MANDATE = `PHOTOREALISM IS MANDATORY: the image must read as a real photograph (DSLR/cinema camera on a practical set) — natural skin texture, physically correct lighting, tactile materials, filmic color. If it reads as concept art, digital illustration, painting, or cel shading, cap the score at 4 regardless of other merits.`;

export function castingBrief(characterName: string, description: string): string {
  return [
    `Rate this casting headshot 1-10 on how well it matches this character.`,
    `Character: ${characterName}.`,
    `Description: ${description || "No description provided"}.`,
    `Consider: age accuracy, physical description match, casting quality.`,
    REALISM_MANDATE,
  ].join(" ");
}

/** Location brief (best of 5) */
export function locationBrief(name: string, description: string, timeOfDay: string, mood: string): string {
  return [
    `Rate this location scout photo 1-10 on how well it matches this brief.`,
    `Location: ${name}.`,
    description ? `Description: ${description}.` : "",
    timeOfDay ? `Time of day: ${timeOfDay}.` : "",
    mood ? `Mood: ${mood}.` : "",
    `Consider: setting accuracy, lighting/time-of-day match, mood, production usability.`,
    REALISM_MANDATE,
  ].filter(Boolean).join(" ");
}

/** Scene scout brief (best of 3) */
export function sceneScoutBrief(actionSummary: string, location: string, mood: string, charactersPresent: string[]): string {
  return [
    `Rate this scene reference image 1-10 on how well it captures this scene.`,
    `Scene action: ${actionSummary || "n/a"}.`,
    location ? `Location: ${location}.` : "",
    mood ? `Mood: ${mood}.` : "",
    charactersPresent.length > 0 ? `Characters who should feel present: ${charactersPresent.join(", ")}.` : "",
    `Consider: atmosphere match, location accuracy, emotional tone, cinematic quality.`,
    REALISM_MANDATE,
  ].filter(Boolean).join(" ");
}
