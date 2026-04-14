import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Image generation via Gemini 2.5 Flash (native image output).
 *
 * Uses the @google/genai SDK with responseModalities: [Modality.IMAGE, Modality.TEXT]
 * to generate character casting portraits from text prompts.
 *
 * Set GOOGLE_AI_API_KEY in .env.local.
 * Falls back to placeholder SVGs if the key is not set.
 */

export interface GeneratedImage {
  /** Base64 data URL (data:image/png;base64,...) or placeholder SVG data URL */
  url: string;
  /** The prompt that was sent to the model */
  prompt: string;
}

/**
 * Generate a single character casting image.
 */
export async function generateCastingImage(
  characterName: string,
  description: string,
  variationNumber: number
): Promise<GeneratedImage> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  const prompt = buildCastingPrompt(characterName, description, variationNumber);

  if (!apiKey || apiKey === "your-key-here") {
    return generatePlaceholder(characterName, prompt, variationNumber);
  }

  return await generateWithGemini(apiKey, prompt, characterName, variationNumber);
}

/**
 * Generate all 10 casting variations for a character sequentially.
 * Each variation uses a slightly different prompt to get distinct results.
 */
export async function generateAllVariations(
  characterName: string,
  description: string,
  count: number = 10
): Promise<GeneratedImage[]> {
  const results: GeneratedImage[] = [];

  for (let i = 1; i <= count; i++) {
    const image = await generateCastingImage(characterName, description, i);
    results.push(image);
  }

  return results;
}

/**
 * Generate a location reference image.
 */
export async function generateLocationImage(
  locationName: string,
  description: string,
  timeOfDay: string,
  mood: string,
  variationNumber: number,
  productionNotes?: string
): Promise<GeneratedImage> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  const prompt = buildLocationPrompt(locationName, description, timeOfDay, mood, variationNumber, productionNotes);

  if (!apiKey || apiKey === "your-key-here") {
    return generatePlaceholder(locationName, prompt, variationNumber);
  }

  return await generateWithGemini(apiKey, prompt, locationName, variationNumber);
}

/**
 * Prepends the per-project production directive so director-level style rules
 * (aspect ratio, color grade, continuity overrides) win over generic prompt
 * boilerplate in every downstream image.
 */
function productionDirectivePrefix(notes?: string): string {
  const trimmed = (notes || "").trim();
  if (!trimmed) return "";
  return `PRODUCTION DIRECTIVE (locked — these rules override any conflicting style guidance below): ${trimmed}`;
}

function buildLocationPrompt(
  name: string,
  description: string,
  timeOfDay: string,
  mood: string,
  variation: number,
  productionNotes?: string
): string {
  const styles = [
    "wide establishing shot",
    "medium shot showing key details",
    "atmospheric shot emphasizing mood",
    "high angle overview",
    "low angle dramatic perspective",
  ];
  const style = styles[(variation - 1) % styles.length];

  return [
    productionDirectivePrefix(productionNotes),
    `Generate a high-quality cinematic location reference photograph.`,
    `Location: ${name}.`,
    description ? `Description: ${description}.` : "",
    timeOfDay ? `Time of day: ${timeOfDay}.` : "",
    mood ? `Mood/atmosphere: ${mood}.` : "",
    `Camera: ${style}.`,
    `Style: Film production location scout photo, cinematic color grading,`,
    `photorealistic, high resolution, production-ready reference image.`,
    `Variation ${variation} — show a distinctly different angle or lighting condition.`,
  ].filter(Boolean).join(" ");
}

/**
 * Generate an atmospheric scene scouting image.
 * Shows the mood/atmosphere of a scene — characters in context, not just empty location.
 */
export async function generateSceneScoutImage(opts: {
  sceneNumber: number;
  actionSummary: string;
  location: string;
  timeOfDay: string;
  mood: string;
  sceneType: string;
  charactersPresent: string[];
  characterDescriptions: Record<string, string>;
  variationNumber: number;
  productionNotes?: string;
}): Promise<GeneratedImage> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  const prompt = buildSceneScoutPrompt(opts);
  const label = `Scene ${opts.sceneNumber}`;

  if (!apiKey || apiKey === "your-key-here") {
    return generatePlaceholder(label, prompt, opts.variationNumber);
  }

  return await generateWithGemini(apiKey, prompt, label, opts.variationNumber);
}

function buildSceneScoutPrompt(opts: {
  sceneNumber: number;
  actionSummary: string;
  location: string;
  timeOfDay: string;
  mood: string;
  sceneType: string;
  charactersPresent: string[];
  characterDescriptions: Record<string, string>;
  variationNumber: number;
  productionNotes?: string;
}): string {
  const charDetails = opts.charactersPresent
    .map((name) => {
      const desc = opts.characterDescriptions[name];
      return desc ? `${name} (${desc})` : name;
    })
    .join(", ");

  const visualStyles = [
    "wide cinematic establishing shot showing characters in environment",
    "intimate medium shot capturing the emotional core of the scene",
    "atmospheric detail shot — focus on mood and environment texture",
  ];
  const style = visualStyles[(opts.variationNumber - 1) % visualStyles.length];

  const sceneTypeNote = opts.sceneType && opts.sceneType !== "real"
    ? `Scene type: ${opts.sceneType} — adjust visuals accordingly (surreal, stylized, or heightened reality).`
    : "";

  return [
    productionDirectivePrefix(opts.productionNotes),
    `Generate a high-quality cinematic scene reference image for film pre-production.`,
    `Scene ${opts.sceneNumber}: ${opts.actionSummary}`,
    `Location: ${opts.location}.`,
    opts.timeOfDay ? `Time of day: ${opts.timeOfDay}.` : "",
    opts.mood ? `Mood / atmosphere: ${opts.mood}.` : "",
    sceneTypeNote,
    charDetails ? `Characters present: ${charDetails}.` : "",
    `Composition style: ${style}.`,
    `Style: Cinematic film production reference, photorealistic, professional color grading,`,
    `evocative and mood-driven. This is a scouting/mood board image — not a storyboard panel.`,
  ].filter(Boolean).join(" ");
}

/**
 * Generate a reference pose image for a locked character.
 * pose_type: "front" | "three_quarter" | "profile"
 */
export async function generatePoseImage(
  characterName: string,
  description: string,
  poseType: string
): Promise<GeneratedImage> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  const prompt = buildPosePrompt(characterName, description, poseType);

  if (!apiKey || apiKey === "your-key-here") {
    return generatePlaceholder(characterName, prompt, poseType === "front" ? 1 : poseType === "three_quarter" ? 2 : 3);
  }

  return await generateWithGemini(apiKey, prompt, characterName, 1);
}

function buildPosePrompt(
  name: string,
  description: string,
  poseType: string
): string {
  const poseInstructions: Record<string, string> = {
    front: "facing directly toward the camera, symmetrical front view, shoulders square",
    three_quarter: "three-quarter angle turn, one shoulder slightly forward, classic portrait pose",
    profile: "full side profile view, facing left, clean silhouette",
  };

  const pose = poseInstructions[poseType] || poseInstructions.front;

  return [
    `Generate a high-quality character reference pose photograph.`,
    `Character: ${name}.`,
    `Physical description: ${description}.`,
    `Pose: ${pose}.`,
    `Purpose: This is a canonical reference image for film production.`,
    `Style: Full upper body visible, clean neutral gray background,`,
    `even studio lighting, no shadows on background, photorealistic,`,
    `high resolution, consistent with a professional character reference sheet.`,
  ].join(" ");
}

function buildCastingPrompt(
  name: string,
  description: string,
  variation: number
): string {
  const angles = [
    "looking directly at the camera",
    "slight three-quarter turn to the left",
    "slight three-quarter turn to the right",
    "looking slightly upward",
    "looking slightly downward with chin tilted",
    "profile view facing left",
    "profile view facing right",
    "looking over their shoulder",
    "candid expression, mid-thought",
    "intense direct gaze at camera",
  ];

  const angle = angles[(variation - 1) % angles.length];

  return [
    `Generate a high-quality cinematic casting headshot photograph.`,
    `Character: ${name}.`,
    `Physical description: ${description}.`,
    `Pose: ${angle}.`,
    `Style: Professional casting photo, cinematic lighting, shallow depth of field,`,
    `clean neutral background, photorealistic, high resolution.`,
    `This is variation ${variation} of 10 — make this distinctly different from other variations`,
    `while staying true to the character description.`,
  ].join(" ");
}

/**
 * Generate a storyboard panel image for a specific shot.
 * If sceneReferenceImageUrl is provided (an approved scene scout image), it's passed
 * to Gemini as a visual reference for consistent atmosphere and color grading.
 */
export async function generateStoryboardPanel(opts: {
  actionDescription: string;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  charactersInShot: string[];
  characterDescriptions: Record<string, string>; // name → description
  locationName: string;
  locationDescription: string;
  timeOfDay: string;
  mood: string;
  panelNumber: number;
  sceneReferenceImageUrl?: string | null; // optional approved scout image
  productionNotes?: string;
}): Promise<GeneratedImage> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  const prompt = buildStoryboardPrompt(opts);
  const label = `Panel ${opts.panelNumber}`;

  if (!apiKey || apiKey === "your-key-here") {
    return generatePlaceholder(label, prompt, opts.panelNumber);
  }

  // If we have an approved scene scout reference image, use multimodal generation
  if (opts.sceneReferenceImageUrl) {
    const match = opts.sceneReferenceImageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const [, mimeType, base64Data] = match;
      const ai = new GoogleGenAI({ apiKey });
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-image-preview",
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: `Use the above image as an atmospheric reference for color palette, lighting mood, and visual style.\n\n${prompt}` },
              ],
            },
          ],
          config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            const outMime = part.inlineData.mimeType || "image/png";
            return { url: `data:${outMime};base64,${part.inlineData.data}`, prompt };
          }
        }
      } catch {
        // Fall through to standard generation if multimodal fails
      }
    }
  }

  return await generateWithGemini(apiKey, prompt, label, opts.panelNumber);
}

function buildStoryboardPrompt(opts: {
  actionDescription: string;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  charactersInShot: string[];
  characterDescriptions: Record<string, string>;
  locationName: string;
  locationDescription: string;
  timeOfDay: string;
  mood: string;
  panelNumber: number;
  productionNotes?: string;
}): string {
  const charDetails = opts.charactersInShot
    .map((name) => {
      const desc = opts.characterDescriptions[name];
      return desc ? `${name}: ${desc}` : name;
    })
    .join("; ");

  return [
    productionDirectivePrefix(opts.productionNotes),
    `Generate a cinematic storyboard panel for a film production.`,
    `Shot type: ${opts.shotType || "medium shot"}.`,
    `Camera angle: ${opts.cameraAngle || "eye-level"}.`,
    opts.cameraMovement ? `Camera movement: ${opts.cameraMovement}.` : "",
    `Action: ${opts.actionDescription}.`,
    opts.charactersInShot.length > 0 ? `Characters in shot: ${charDetails}.` : "",
    `Location: ${opts.locationName}.`,
    opts.locationDescription ? `Setting: ${opts.locationDescription}.` : "",
    opts.timeOfDay ? `Time of day: ${opts.timeOfDay}.` : "",
    opts.mood ? `Mood: ${opts.mood}.` : "",
    `Style: Professional storyboard illustration with cinematic framing,`,
    `dramatic lighting, film-quality composition, photorealistic.`,
    `This is panel ${opts.panelNumber} in the sequence.`,
  ].filter(Boolean).join(" ");
}

/**
 * Generate a character pose sheet using an approved headshot as a visual reference.
 * Passes the reference image + the pose sheet prompt to Gemini multimodal.
 */
export async function generatePoseSheet(
  characterName: string,
  description: string,
  referenceImageDataUrl: string,   // the approved headshot as a data URL
  customPrompt: string             // the user-defined pose sheet prompt
): Promise<GeneratedImage> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  const fullPrompt = [
    customPrompt,
    `Character name: ${characterName}.`,
    description ? `Physical description for reference: ${description}.` : "",
  ].filter(Boolean).join("\n");

  if (!apiKey || apiKey === "your-key-here") {
    return generatePlaceholder(characterName, fullPrompt, 99);
  }

  // Extract base64 data and mime type from the data URL
  const match = referenceImageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    console.error("generatePoseSheet: invalid reference image data URL");
    return generatePlaceholder(characterName, fullPrompt, 99);
  }
  const [, mimeType, base64Data] = match;

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [
        {
          role: "user",
          parts: [
            // Reference image first
            { inlineData: { mimeType, data: base64Data } },
            // Then the pose sheet prompt
            { text: fullPrompt },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const outMime = part.inlineData.mimeType || "image/png";
          return {
            url: `data:${outMime};base64,${part.inlineData.data}`,
            prompt: fullPrompt,
          };
        }
      }
    }

    console.error("generatePoseSheet: Gemini returned no image, falling back");
    return generatePlaceholder(characterName, fullPrompt, 99);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("generatePoseSheet failed:", errMsg);
    if (errMsg.includes("429") || errMsg.includes("quota")) {
      throw new Error("Gemini API quota exceeded. Please check your Google AI billing.");
    }
    if (errMsg.includes("403") || errMsg.includes("401")) {
      throw new Error("Gemini API authentication failed. Check your GOOGLE_AI_API_KEY.");
    }
    return generatePlaceholder(characterName, fullPrompt, 99);
  }
}

/**
 * Generate an image using Gemini 2.5 Flash with native image output.
 */
export async function generateWithGemini(
  apiKey: string,
  prompt: string,
  characterName: string,
  variationNumber: number
): Promise<GeneratedImage> {
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: prompt,
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    // Extract image from response parts
    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content?.parts || [];

      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mimeType = part.inlineData.mimeType || "image/png";
          const base64 = part.inlineData.data;
          return {
            url: `data:${mimeType};base64,${base64}`,
            prompt,
          };
        }
      }
    }

    console.error("Gemini returned no image data, falling back to placeholder");
    return generatePlaceholder(characterName, prompt, variationNumber);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Gemini image generation failed:", errMsg);
    // Surface quota/auth errors instead of silently falling back
    if (errMsg.includes("429") || errMsg.includes("quota")) {
      throw new Error(`Gemini API quota exceeded. Please check your Google AI billing at https://aistudio.google.com/`);
    }
    if (errMsg.includes("403") || errMsg.includes("401")) {
      throw new Error(`Gemini API authentication failed. Check your GOOGLE_AI_API_KEY.`);
    }
    return generatePlaceholder(characterName, prompt, variationNumber);
  }
}

/**
 * Placeholder generator — deterministic colored SVG.
 * Used when GOOGLE_AI_API_KEY is not set or Gemini fails.
 */
function generatePlaceholder(
  name: string,
  prompt: string,
  variation: number
): GeneratedImage {
  const hash = simpleHash(`${name}-${variation}`);
  const hue = hash % 360;
  const sat = 25 + (hash % 30);
  const light = 20 + (hash % 15);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="hsl(${hue}, ${sat}%, ${light}%)" />
    <text x="256" y="220" text-anchor="middle" font-family="sans-serif" font-size="120" fill="hsl(${hue}, ${sat}%, ${light + 40}%)">${initials}</text>
    <text x="256" y="310" text-anchor="middle" font-family="monospace" font-size="24" fill="hsl(${hue}, ${sat}%, ${light + 25}%)">Variation ${variation}</text>
    <text x="256" y="350" text-anchor="middle" font-family="monospace" font-size="16" fill="hsl(${hue}, ${sat}%, ${light + 15}%)">${name}</text>
    <text x="256" y="480" text-anchor="middle" font-family="monospace" font-size="11" fill="hsl(${hue}, ${sat}%, ${light + 10}%)">PLACEHOLDER — set GOOGLE_AI_API_KEY</text>
  </svg>`;

  const encoded = Buffer.from(svg).toString("base64");
  return {
    url: `data:image/svg+xml;base64,${encoded}`,
    prompt,
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
