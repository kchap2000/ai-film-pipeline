# AI Image Generation for Film: Photorealism + Character Consistency (June 2026)

**Goal:** Maximize (a) photorealism and (b) character/element consistency across many shots, given locked character headshots and reference images. This report compares the leading 2026 options and gives a concrete recommendation for a pipeline already on `gemini-3-pro-image` (first frames) and `gemini-3.1-flash-image` (storyboards/casting).

**TL;DR recommendation:** Yes — move casting and pose-sheets (anything where identity must be exact) to **Gemini 3 Pro Image (Nano Banana Pro)**. Keep cheap, high-volume storyboard roughs on **Flash (Nano Banana 2)**. **GPT Image 2 is worth adding only for hero shots that need flawless on-image text or print-grade material/texture realism.** The single highest-leverage change is **building a locked, reused reference set per character (3–5 identity images, clean front/3‑4/profile, neutral light) and re-asserting identity + preserve-list language on every generation** — that beats any model swap for consistency.

---

## 1. Google Gemini — Nano Banana Pro (`gemini-3-pro-image`) and Nano Banana 2 (`gemini-3.1-flash-image`)

### Reference image limits
Both Gemini 3.x image models share the same multi-image envelope:
- **Up to 14 input images** can be blended into a single output.
- Of those, **up to 6 can be treated as "high-fidelity" object/element references** (props, wardrobe, set pieces preserved in detail).
- **Up to 5 distinct human identities** can be held consistent in one image.

This is the key architectural fact for a film pipeline: you can feed a character headshot set **plus** environment/prop references **plus** a wardrobe reference in a single call, and explicitly tell the model which is which.

### Weighting identity vs. environment refs
Google's official guidance is to **assign each reference a role in the prompt** rather than relying on order or implicit weighting:
> "Use Image A for the character's pose, Image B for the art style, and Image C for the background environment."

The official formula is **`[Reference images] + [Relationship instruction] + [New scenario]`**. There is no numeric weight slider — control comes from *naming the job of each image in natural language*. For identity, put the character refs first and explicitly say "preserve the exact face, hair, and build of the person in images 1–3; use image 4 only for the room."

### Photoreal prompting best-practices (Google official)
- **Camera/lens/film-stock language works and is encouraged.** Specify the camera body ("shot on Fujifilm," "GoPro," "disposable camera"), aperture/lens ("low-angle, shallow DoF, f/1.8," "85mm," "macro," "wide-angle"), and film stock ("1980s color film, slightly grainy," "cinematic color grade, muted teal").
- **Lighting as a cinematographer would describe it:** "three-point softbox," "chiaroscuro, harsh high contrast," "golden-hour backlight, long shadows."
- **Name materials, not categories:** "navy blue tweed" not "suit jacket"; "ornate elven plate etched with silver leaf" not "armor." Material specificity is one of the biggest realism levers.
- **What HURTS realism / what to avoid:**
  - **Don't use keyword lists** — "describe the scene narratively."
  - **Use positive framing, not negatives** — say "empty street," not "no cars." Google's model does NOT use a classic negative-prompt field; describing absence by negation tends to summon the thing.
  - **Don't conflict styles** — never ask for photorealism and illustration/cartoon in the same prompt.
  - **Don't overload** — 500+ word prompts degrade results; be specific but concise.

### Character consistency techniques
- Primary lever is the **reference-image set + role instructions** (above). No LoRA/fine-tune is exposed; consistency is in-context, driven by the references you pass each call.
- **No seed-locking for identity** in the documented API the way diffusion tools expose it — consistency comes from passing the *same locked reference set every time* and re-stating "preserve identity."
- Multi-subject consistency holds up to 5 people, but Google explicitly notes it "may not always get it right" — so re-assert per call.

### Pro vs. Flash tradeoffs
| | **Pro — `gemini-3-pro-image`** | **Flash — `gemini-3.1-flash-image` (NB2)** |
|---|---|---|
| Quality/realism | Higher fidelity, better identity hold, fewer blend artifacts | Very strong (SOTA on release Feb 2026) but a notch below Pro on hard identity/material |
| Resolution | 2K and 4K | up to 4K (upscale) |
| Cost (standard) | ~**$0.134** /image at 1K–2K, **$0.24** at 4K (batch ≈ 50% off) | ~**$0.067** /2K image (≈ half of Pro) |
| Latency | Higher (commonly ~8–12s; ~2–5s reported for some 4K paths) | Faster |
| Use when | Hero frames, casting locks, pose sheets, anything identity-critical | High-volume storyboards, rough blocking, first-pass casting variations |

**Failure modes (both):** identity drift when the reference set changes between shots or "preserve identity" is dropped; unnatural artifacts on complex blends/edits; text/visual fidelity still imperfect; era/anachronism leakage when world-knowledge grounding fills gaps the prompt left open (lock the period explicitly). Every output carries a **SynthID** watermark.

---

## 2. OpenAI — GPT Image 2 (`gpt-image-2`, successor to gpt-image-1 / 1.5)

Released **April 21, 2026**.

### Reference image limits
- Accepts **up to 16 reference images** (up to 100 MB each) per generation.
- Reference images are **processed at high fidelity automatically** — no manual fidelity flag; the model "always does its best to preserve the details of the input."
- Pass one image to edit it, or multiple to combine subjects/styles/references.

### Weighting identity vs. environment
GPT Image 2 has **no role-assignment formula as explicit as Google's**, but OpenAI's own prompting guidance compensates with a discipline: **state invariants every iteration.** You enumerate what must be preserved (identity, geometry, layout, label text) in plain language and repeat that "preserve list" on every call.

### Photoreal prompting (OpenAI official)
- **Use the word "photorealistic" directly** and add **real-world texture cues** — "pores, wrinkles, fabric wear, imperfections." OpenAI explicitly leans on imperfection as the anti-illustration technique.
- **Camera language guides look but is interpreted loosely** — focal length, DoF, film stock, exposure hints set the *vibe*, not exact optics (unlike a diffusion model that respects f-stops more literally).
- **State composition explicitly:** camera distance, angle, subject placement, negative space, aspect ratio.
- For functional clarity (signage, labels), **avoid decorative adjectives** ("beautiful" doesn't make text readable) — use "sharp label text," "clean kerning."

### Character consistency
- **Significantly more consistent than prior OpenAI models** — faces stay stable across variations, style transfers, and partial edits. OpenAI demoed 8 outfit variations from one uploaded image holding identity.
- Marketed for storyboards / multi-page character work where "characters look the same across scenes."
- **Anti-drift technique is the core method:** "Models drift silently when you stop repeating the rules." Restate the preserve-list every edit; **change only one thing per edit.**

### Photorealism strength
State-of-the-art on **fine material detail and on-image text** — fabric textures, skin pores, reflections, depth of field, and **pixel-perfect text rendering** (its standout vs. Gemini). Strong for brand/product photography.

### Cost / latency
- Token-priced: **$8/M image input tokens, $30/M image output tokens, $5/M text input.**
- Practically: **~$0.006 low / ~$0.053 medium / ~$0.211 high** per 1024² image; Batch API ≈ 50% off (e.g. ~$0.0265 medium).
- **Latency ~4.5s/image** (developer benchmarks, April 2026).

**Failure modes:** silent identity/layout drift when invariants aren't repeated; loose interpretation of precise camera optics; occasional 504/timeout failures on heavy jobs; tends to "improve" things you wanted left alone unless you pin them.

---

## 3. Other leading options (only the genuinely competitive ones)

- **Flux Kontext (Black Forest Labs)** — best-in-class for **reference-driven editing / maintaining a subject across edits**. It's built for "produce a variation of *this* exact thing." If your pipeline ever needs surgical edits that hold a locked subject (re-pose, re-light, swap background) better than a fresh generation, Kontext is the specialist. Slight softening of fine detail on tight masks. **Also supports open-weight/LoRA-style fine-tuning** — the only mainstream path here to a *trained* character embedding rather than in-context refs.
- **Seedream 4.x (ByteDance)** — strong realism, high-res output, and a **multi-image consistency approach** aimed squarely at character/style consistency. A credible alternative if Gemini identity hold disappoints on a specific look.
- **Midjourney (character reference / `--cref`)** — gorgeous, stylized, great for concept/mood, but **weaker precision control** for element replacement and exact identity locking. Good for look-dev, not for shot-to-shot identity-critical continuity.

None of these clearly beats the Gemini-3-Pro + GPT-Image-2 pairing for a *photoreal* film pipeline that already feeds locked headshots — except **Flux Kontext for edit-consistency** and **a Flux/LoRA fine-tune** if you want a permanently trained character.

---

## Recommendation for your pipeline

You currently use `gemini-3-pro-image` for first frames and `gemini-3.1-flash-image` for storyboards/casting.

**1. Move casting + pose-sheets to Pro? — Yes, for the identity-critical ones.**
Casting locks and pose sheets *define* the character that every downstream shot must match. Errors there propagate. Pro's better identity hold and fewer blend artifacts justify the ~2× cost on these comparatively low-volume, high-stakes images. **Keep Flash for high-volume storyboard roughs / blocking** where you just need composition and the character "close enough" — that's the right cost/quality split. Net: Pro for the *reference-defining* frames (casting locks, pose/turnaround sheets, first frames), Flash for the *consuming* frames (storyboard panels).

**2. Is GPT Image 2 worth adding? — Selectively, yes.**
Add it for two narrow jobs where it beats Gemini: **(a) hero shots needing flawless on-image text** (signage, props with legible labels, titles), and **(b) print-grade material/skin-pore/fabric realism** on a small number of marquee frames. It is **not** worth swapping your whole pipeline to — Gemini's explicit reference-role formula and 14-image blend are better suited to multi-element film shots, and running two providers doubles prompt-engineering surface and identity-drift risk. Treat GPT Image 2 as a **specialist finishing tool**, not the spine.

**3. Single highest-leverage change for consistency + realism:**
**Lock a canonical reference set per character and re-assert it every generation.** Concretely:
- Build a 3–5 image identity pack per character: clean front, 3/4, and profile, neutral even lighting, no heavy expression — the same files reused on *every* call.
- In every prompt, **name the role of each reference** ("images 1–3 = preserve this exact face/hair/build; image 4 = wardrobe; image 5 = set") using Google's `[refs] + [relationship instruction] + [new scenario]` formula.
- **Re-state a preserve-list every shot** ("preserve identity, build, hairline, wardrobe; only the pose and camera change") — both Google and OpenAI confirm models drift the moment you stop repeating the rules.
- **Lock the era/material explicitly** to stop world-knowledge anachronism leakage, and use **positive framing only** (no negatives), narrative (not keyword lists), with **specific materials + camera/lens/film-stock language** for realism.

This reference-discipline change costs nothing, works across Pro/Flash/GPT Image 2, and removes the dominant source of cross-shot drift — far more impact than any single model swap.

---

## Sources

- Nano Banana Pro for developers (official) — https://blog.google/innovation-and-ai/technology/developers-tools/gemini-3-pro-image-developers/
- Nano Banana Pro prompting tips (official Google) — https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/
- Ultimate prompting guide for Nano Banana (Google Cloud Blog, official) — https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana
- Nano Banana Pro available for enterprise (Google Cloud) — https://cloud.google.com/blog/products/ai-machine-learning/nano-banana-pro-available-for-enterprise
- Gemini 3 Pro Image — Google DeepMind — https://deepmind.google/models/gemini-image/pro/
- Gemini 3 Pro Image (Nano Banana Pro) — Google AI Studio — https://aistudio.google.com/models/gemini-3-pro-image
- Nano Banana Pro: Gemini 3 Pro Image — Google blog — https://blog.google/innovation-and-ai/products/nano-banana-pro/
- Gemini 3 Pro Image pricing/speed analysis — https://www.aifreeapi.com/en/posts/gemini-3-pro-image-cheapest-api
- What Is Gemini 3 Pro Image (MindStudio) — https://www.mindstudio.ai/blog/what-is-gemini-3-pro-image
- Nano Banana 2 (Gemini 3.1 Flash Image) on OpenRouter — pricing/benchmarks — https://openrouter.ai/google/gemini-3.1-flash-image-preview
- Nano Banana 2 / Gemini 3.1 Flash Image complete guide (2026) — https://almcorp.com/blog/google-nano-banana-2-gemini-31-flash-image-complete-guide/
- Nano Banana 2 SOTA writeup (Latent Space) — https://www.latent.space/p/ainews-nano-banana-2-aka-gemini-31
- GPT Image 2 (OpenAI) on Replicate — https://replicate.com/openai/gpt-image-2
- GPT Image 2 on fal — https://fal.ai/gpt-image-2
- What Is GPT Image 2 (MindStudio) — https://www.mindstudio.ai/blog/what-is-gpt-image-2-openai
- GPT Image 2: Complete Guide 2026 (BeFreed) — https://www.befreed.ai/blog/gpt-image-2-guide-2026
- GPT Image 2 API specs & pricing (Unifically) — https://unifically.com/blogs/gpt-image-2
- GPT Image 2 pricing 2026 (WaveSpeed) — https://wavespeed.ai/blog/posts/gpt-image-2-pricing-2026/
- OpenAI API pricing — https://openai.com/api/pricing/
- OpenAI GPT image models prompting guide (cookbook) — https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
- Prompting GPT Image 2 like a pro (field guide) — https://www.i-scoop.eu/prompting-gpt-image-2-like-a-pro-guide/
- AI image pricing 2026: Google vs OpenAI (IntuitionLabs) — https://intuitionlabs.ai/articles/ai-image-generation-pricing-google-openai
- Best AI image models 2026: Flux, GPT Image 2, Seedream… (Melies) — https://melies.co/compare/ai-image-models
- AI image generation in 2026: Midjourney, Flux 2, Imagen 4… (Medium/Cliprise) — https://medium.com/@cliprise/ai-image-generation-in-2026-midjourney-flux-2-imagen-4-and-beyond-7934a9228e98
- Best AI image model compared: Nano Banana Pro vs GPT-Image vs Midjourney (Invideo) — https://invideo.io/blog/best-ai-image-model-comparison/
