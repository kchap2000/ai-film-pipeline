// A/B score two clips (start-frame vs element-only) with Gemini video understanding
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const A_URL = process.argv[2]; // start-frame version
const B_URL = process.argv[3]; // element-only version
const MODEL = process.argv[4] || "gemini-3-flash-preview";

async function toB64(url) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  console.error(`fetched ${url.slice(-40)}: ${(buf.length / 1e6).toFixed(1)}MB`);
  return buf.toString("base64");
}

const [a, b] = await Promise.all([toB64(A_URL), toB64(B_URL)]);

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GOOGLE_AI_API_KEY}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contents: [{
      role: "user",
      parts: [
        { text: "CLIP A:" },
        { inlineData: { mimeType: "video/mp4", data: a } },
        { text: "CLIP B:" },
        { inlineData: { mimeType: "video/mp4", data: b } },
        { text: `Both clips were generated from the same shot description for a vertical-drama fantasy episode. Score EACH clip 1-10 on:
1. REALISM — real film-set footage (10) vs animated/illustrated (1)
2. MOTION QUALITY — smooth natural movement (10) vs jerky/warped (1)
3. SHOT FIDELITY — follows the 3-beat structure: soldier crawling to commander in despair, commander sinking to his knees surveying fire, extreme close-up of dragon's slit pupil (10 = all beats, correct framing)
4. CHARACTER CONSISTENCY — identities stable within the clip
Then declare a WINNER overall and explain in 2 sentences.
Return JSON: {"A": {"realism": n, "motion": n, "fidelity": n, "consistency": n}, "B": {...}, "winner": "A"|"B"|"tie", "explanation": "..."}` },
      ],
    }],
  }),
});
const d = await res.json();
const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
console.log(text.match(/\{[\s\S]*\}/)?.[0] || JSON.stringify(d).slice(0, 400));
