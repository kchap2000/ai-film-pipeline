// A/B test: old Flash frame vs new Pro+photoreal-prompt frame, scored by the gate rubric
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("/Users/khalilchapman/Desktop/ai-film-pipeline/.env.local", "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const RUBRIC = `Score this image for PHOTOREALISM as a film production still.
10 = indistinguishable from a DSLR/cinema-camera photograph on a practical film set
8 = clearly generated but photorealistic - minor tells
5 = mixed - photographic composition but illustrated surfaces
3 = predominantly concept art / digital illustration
1 = cartoon or painted
Judge rendering style only, not genre. Return ONLY JSON: {"score": <1-10>, "style": "photorealistic"|"mixed"|"illustration", "issues": ["..."]}`;

async function score(dataUrl, label) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", max_tokens: 400,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
        { type: "text", text: RUBRIC },
      ]}],
    }),
  });
  const d = await res.json();
  const text = (d.content || []).map((b) => b.text || "").join("");
  console.log(`${label}:`, text.match(/\{[\s\S]*\}/)?.[0] || text.slice(0, 200));
}

// 1. Old frame (Flash + old prompt): Apex panel 2's approved frame
const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: panel } = await supabase.from("storyboard_panels")
  .select("approved_first_frame_id, action_description")
  .eq("id", "5e4424bd-953d-4b0e-8bd4-b58cdb353c1e").single();
const { data: oldFrame } = await supabase.from("first_frames")
  .select("image_url").eq("id", panel.approved_first_frame_id).single();
await score(oldFrame.image_url, "OLD (flash, old prompt)");

// 2. New frame: gemini-3-pro-image + photoreal narrative prompt, same shot
const prompt = `A production still captured on an ARRI Alexa 65 with anamorphic prime lenses during a film shoot — a real photograph from a practical set, never an illustration, painting, or concept art. The shot: a wide shot from an eye-level angle, shallow depth of field around f/2.0 with optically soft bokeh. In the frame: ${panel.action_description}. The setting is Aetheron Border City — defense line and ruins at dusk; the atmosphere reads epic, desperate. Physical realism is non-negotiable: skin shows pores, oil, and subsurface scattering; metal carries wear, scratches, and physically correct specular highlights; fabric shows its weave, leather its grain, stone its chips and dust. Lighting follows real physics — motivated sources, soft penumbra shadows, natural falloff. Graded like developed film negative: slightly desaturated, filmic contrast, subtle halation and natural grain. No oversaturated palettes, no clean vector edges, no flat color fills, no painterly brushwork, no cel shading. Aspect ratio: 9:16.`;
const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=${env.GOOGLE_AI_API_KEY}`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
});
const gen = await genRes.json();
const imgPart = (gen.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
if (!imgPart) { console.log("PRO GEN FAILED:", JSON.stringify(gen).slice(0, 300)); process.exit(1); }
const newUrl = `data:${imgPart.inlineData.mimeType || "image/png"};base64,${imgPart.inlineData.data}`;
await score(newUrl, "NEW (gemini-3-pro-image, photoreal prompt)");
