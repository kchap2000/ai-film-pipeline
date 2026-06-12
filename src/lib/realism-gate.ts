import Anthropic from "@anthropic-ai/sdk";

/**
 * Realism gate (diagnostic v3 P0). First frames that look like concept art
 * propagate that style into every animated clip — Higgsfield animates FROM
 * the frame. This gate scores each frame for photorealism with Claude
 * Haiku vision and tells the orchestrator to re-roll low scorers with the
 * anti-illustration prompt boost before they reach video generation.
 *
 * Codifies the manual "realism pass" Khalil ran during the Supercreator
 * phase: generate → inspect photo-vs-illustration → regenerate until real.
 */

export interface RealismVerdict {
  /** 1-10; 10 = indistinguishable from a DSLR still on a film set */
  score: number;
  style: "photorealistic" | "mixed" | "illustration";
  issues: string[];
}

export const REALISM_PASS_SCORE = 7;

const SCORING_MODEL = "claude-haiku-4-5-20251001";

const RUBRIC = `Score this image for PHOTOREALISM as a film production still.

10 = indistinguishable from a DSLR/cinema-camera photograph taken on a practical film set
 8 = clearly generated but photorealistic — only minor tells in lighting or texture
 5 = mixed — photographic composition but illustrated surfaces or painterly rendering
 3 = predominantly concept art / digital illustration style
 1 = cartoon, cel-shaded, anime, or obviously painted

Evaluate specifically: skin texture (pores, subsurface scattering vs airbrushed), lighting physics (soft shadow falloff, specular highlights on metal vs flat painted light), material believability (fabric weave, leather grain, steel wear), edge character (optical softness vs clean vector linework), color naturalism (filmic, slightly desaturated vs oversaturated fantasy palette).

Genre is NOT the question — a dragon can be photorealistic (think practical-effects blockbuster VFX plate) and a kitchen can be illustrated. Judge rendering style only.`;

export async function scoreRealism(
  imageUrl: string,
  /**
   * When provided, the gate also screens for anachronisms against the
   * project's setting profile (learning system) — modern gear in a
   * medieval world fails the gate even if it renders photorealistically.
   */
  settingProfile?: { era?: string; forbidden?: string[] } | null
): Promise<RealismVerdict | null> {
  const dataMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  let imageBlock: Anthropic.ImageBlockParam | null = null;
  if (dataMatch) {
    if (dataMatch[1].includes("svg")) return null; // placeholders aren't scoreable
    imageBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: dataMatch[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: dataMatch[2],
      },
    };
  } else if (imageUrl.startsWith("http")) {
    imageBlock = { type: "image", source: { type: "url", url: imageUrl } };
  }
  if (!imageBlock) return null;

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: SCORING_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            imageBlock,
            {
              type: "text",
              text: `${RUBRIC}${
                settingProfile?.era
                  ? `\n\nALSO screen for ANACHRONISMS: the setting is ${settingProfile.era}.${settingProfile.forbidden?.length ? ` These must never appear: ${settingProfile.forbidden.join("; ")}.` : ""} If ANY anachronistic item is visible, cap the score at 5 and name it in issues prefixed "ANACHRONISM:".`
                  : ""
              }\n\nReturn ONLY valid JSON: {"score": <1-10>, "style": "photorealistic"|"mixed"|"illustration", "issues": ["<specific tell>", ...]}`,
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
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<RealismVerdict>;
    if (typeof parsed.score !== "number") return null;
    return {
      score: Math.max(1, Math.min(10, parsed.score)),
      style: parsed.style === "photorealistic" || parsed.style === "illustration" ? parsed.style : "mixed",
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6).map(String) : [],
    };
  } catch (err) {
    console.error("realism-gate: scoring failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Anti-illustration addendum injected into regeneration prompts when a
 * frame fails the gate. Built from the failed frame's specific issues plus
 * the research-backed realism directives (narrative hardware/film/texture
 * language — never keyword spam).
 */
export function realismBoost(issues: string[]): string {
  return [
    `REALISM CORRECTION — the previous attempt failed photorealism review${issues.length ? ` (${issues.join("; ")})` : ""}.`,
    `This frame must read as a captured photograph from an ARRI Alexa 65 with anamorphic glass on a practical set, not a rendering.`,
    `Skin shows pores, oil, and subsurface scattering — never airbrushed. Metal carries wear, fingerprints, and physically correct specular highlights. Fabric shows weave; leather shows grain; stone shows chips and dust.`,
    `Lighting obeys physics: soft penumbra shadows, motivated practical sources, natural light falloff.`,
    `Color is filmic and slightly desaturated like developed negative stock — never oversaturated fantasy palettes.`,
    `No clean vector edges, no flat color fills, no painterly brushwork, no perfect symmetry, no concept-art rendering of any kind.`,
  ].join(" ");
}
