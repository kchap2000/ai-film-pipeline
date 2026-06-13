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
  /**
   * 1-10 beat fidelity (two-axis gate) — only set when a beat description
   * was provided. 10 = the frame IS the scripted moment: right subject,
   * right framing, right action. Clip A/B showed fidelity regressing while
   * realism climbed — frames got prettier but drifted off-script.
   */
  beatScore?: number;
  beatIssues?: string[];
}

// Pass bars (REALISM_NOTES_v5 — target a 10/10 production). Raised from 7
// to 8: the orchestrator gives every sub-bar frame one boosted re-roll, so
// a higher bar just means more frames get a correction pass before they
// seed a video clip.
export const REALISM_PASS_SCORE = 8;
export const BEAT_PASS_SCORE = 7;
export const IDENTITY_PASS_SCORE = 7;

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
   * wardrobe_rules are screened too: a character in modern day-attire when
   * the world is period (Ash, Corin) fails even without an item on the
   * forbidden list (REALISM_NOTES_v5 #3).
   */
  settingProfile?: { era?: string; forbidden?: string[]; wardrobe_rules?: string[] } | null,
  /**
   * When provided, the gate also scores BEAT FIDELITY against the scripted
   * shot (second axis). Pass the panel's shot type + action description.
   */
  beat?: { shotType?: string; action?: string; characters?: string[] } | null
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
                  ? `\n\nALSO screen for ANACHRONISMS — be strict: the setting is ${settingProfile.era}.${settingProfile.wardrobe_rules?.length ? ` Wardrobe in this world MUST follow: ${settingProfile.wardrobe_rules.join("; ")}.` : ""}${settingProfile.forbidden?.length ? ` These must NEVER appear: ${settingProfile.forbidden.join("; ")}.` : ""} If ANY anachronistic item OR out-of-period wardrobe/grooming is visible (e.g. a modern suit, contemporary day-clothes, or modern military gear in a period world), cap the score at 3 and name it in issues prefixed "ANACHRONISM:". A character dressed for the wrong era is an automatic fail even if photorealistic.`
                  : ""
              }${
                beat?.action
                  ? `\n\nSECOND AXIS — BEAT FIDELITY (scored separately as beat_score): does this frame depict THIS scripted shot?\nShot type: ${beat.shotType || "unspecified"}. Scripted action: ${beat.action}. Characters in shot: ${beat.characters?.length ? beat.characters.join(", ") : "as scripted"}.\n10 = this IS the moment — right subject, right framing/shot-size, action clearly underway. 7 = the moment is recognizable but framing or emphasis drifts (e.g. close-up rendered as a wide, secondary character dominates). 4 = subject present but the scripted action is not happening. 1 = wrong subject or wrong moment entirely. Penalize unscripted extra characters that change the shot's meaning. List specific drifts in beat_issues.`
                  : ""
              }\n\nReturn ONLY valid JSON: {"score": <1-10>, "style": "photorealistic"|"mixed"|"illustration", "issues": ["<specific tell>", ...]${beat?.action ? `, "beat_score": <1-10>, "beat_issues": ["<specific drift>", ...]` : ""}}`,
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
    const parsed = JSON.parse(match[0]) as Partial<RealismVerdict> & {
      beat_score?: number;
      beat_issues?: string[];
    };
    if (typeof parsed.score !== "number") return null;
    return {
      score: Math.max(1, Math.min(10, parsed.score)),
      style: parsed.style === "photorealistic" || parsed.style === "illustration" ? parsed.style : "mixed",
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6).map(String) : [],
      ...(typeof parsed.beat_score === "number"
        ? {
            beatScore: Math.max(1, Math.min(10, parsed.beat_score)),
            beatIssues: Array.isArray(parsed.beat_issues) ? parsed.beat_issues.slice(0, 6).map(String) : [],
          }
        : {}),
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
/**
 * Beat-fidelity addendum for re-rolls that failed the second axis: restate
 * the scripted moment as non-negotiable and name the specific drifts.
 */
export function beatBoost(beat: { shotType?: string; action?: string; characters?: string[] }, beatIssues: string[]): string {
  return [
    `BEAT CORRECTION — the previous attempt drifted from the scripted shot${beatIssues.length ? ` (${beatIssues.join("; ")})` : ""}.`,
    `This frame must depict EXACTLY this moment: ${beat.action || "the scripted action"}.`,
    beat.shotType ? `Shot size is non-negotiable: ${beat.shotType} — frame the subject accordingly, not wider or tighter.` : "",
    beat.characters?.length ? `Only these characters appear: ${beat.characters.join(", ")}. No unscripted figures.` : "",
    `The scripted action must be clearly underway in the frame, not implied or about to happen.`,
  ].filter(Boolean).join(" ");
}

/**
 * Identity-consistency check (REALISM_NOTES_v5 #2). Compares a generated
 * frame/pose-sheet against the character's LOCKED headshot and scores how
 * faithfully the face/hair/build match. Inconsistent characters in first
 * frames throw off the video generator downstream, so a drift below
 * IDENTITY_PASS_SCORE triggers a re-roll with an identity-correction boost.
 *
 * Returns null if either image can't be loaded (skip the check — never block).
 */
export interface IdentityVerdict {
  /** 1-10; 10 = unmistakably the same person as the reference */
  match: number;
  issues: string[];
}

export async function scoreIdentity(
  generatedImageUrl: string,
  referenceHeadshotUrl: string,
  characterName: string
): Promise<IdentityVerdict | null> {
  const toBlock = (url: string): Anthropic.ImageBlockParam | null => {
    const m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      if (m[1].includes("svg")) return null;
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: m[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: m[2],
        },
      };
    }
    if (url.startsWith("http")) return { type: "image", source: { type: "url", url } };
    return null;
  };
  const refBlock = toBlock(referenceHeadshotUrl);
  const genBlock = toBlock(generatedImageUrl);
  if (!refBlock || !genBlock) return null;

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: SCORING_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `REFERENCE — the canonical locked likeness of ${characterName}:` },
            refBlock,
            { type: "text", text: `CANDIDATE — a generated frame that should depict the same ${characterName}:` },
            genBlock,
            {
              type: "text",
              text: `Is the person in the CANDIDATE unmistakably the SAME individual as in the REFERENCE? Judge face structure, features, hair, skin tone, age, and build — not pose, expression, lighting, or wardrobe (those may legitimately change shot to shot). 10 = clearly the same person. 7 = same person with minor drift. 4 = related but noticeably different face. 1 = a different person entirely. List the specific mismatches.\n\nReturn ONLY JSON: {"match": <1-10>, "issues": ["<specific facial mismatch>", ...]}`,
            },
          ],
        },
      ],
    });
    const text = response.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { match?: number; issues?: string[] };
    if (typeof parsed.match !== "number") return null;
    return {
      match: Math.max(1, Math.min(10, parsed.match)),
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6).map(String) : [],
    };
  } catch (err) {
    console.error("realism-gate: identity scoring failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Identity-correction addendum for a re-roll that drifted from the locked face. */
export function identityBoost(characterName: string, issues: string[]): string {
  return [
    `IDENTITY CORRECTION — the previous attempt's ${characterName} drifted from the locked reference face${issues.length ? ` (${issues.join("; ")})` : ""}.`,
    `Reproduce ${characterName} as the EXACT same individual shown in the attached identity reference: same face structure, same features, same hair, same skin tone, same age and build.`,
    `Treat the reference as a photograph of a real actor who must be recognizable in this frame. Change only pose, expression, and framing — never the person's identity.`,
  ].filter(Boolean).join(" ");
}

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
