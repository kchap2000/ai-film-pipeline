# Auto-Pipeline Diagnostic Report v4

**Date:** June 11, 2026  
**Latest Run:** "Apex Hunter Siege" (Demo Script)  
**Apex Hunter Project ID:** `35387c49-5a98-42ca-8e3a-7580db5e1591`  
**Prior Run (WAYW Ep2):** `ce2c5a83-efb1-47d4-a3df-b6b279b42be8`  
**Pipeline URL:** https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app  
**Analyzed by:** Cowork (Claude Opus) — live site inspection, full code review, Higgsfield MCP audit, Gemini API research, Supercomputer thread deep-dive, Claude Code session log review  
**v4 Changes from v3:** Incorporated Khalil's corrections on model capabilities, added complete Supercomputer Realism Framework (Realism Prompt Shield, Kinetic Physics Keys, Reference Load Balancing), corrected root cause analysis, added location-as-element technique, updated priority fix list

---

## CRITICAL CORRECTION (from Khalil, June 11)

**v3 stated** that the Flash-tier model may be insufficient for photorealism and recommended model upgrades. **This is WRONG.**

Khalil's correction:
> "There's Gemini 3.5, Nano Banana Pro, Nano Banana 2 — these CAN achieve photorealism. That's not an issue because we do it all the time. I think we're gonna have to modify the prompts in order to get it."

**The root cause is PROMPTS, not MODELS.** Newer models (Gemini 3.5, Nano Banana Pro, Nano Banana 2) are available and achieve photorealism when prompted correctly. Claude Code should independently research the newest available models rather than relying on this report's specific model references.

Additionally, Khalil clarified a key workflow technique:
> "Most times, you can just use the location as an element... then the first frame isn't always necessary with Seedance."

**The location-as-element technique** can bypass the first-frame-quality bottleneck entirely for many shots. Instead of generating a Gemini first frame, use the approved location image as a Higgsfield Element, tag all characters and props, and let Seedance compose the scene directly.

---

## Executive Summary

Two auto-pipeline runs have been completed. The **latest is Apex Hunter Siege** (a fantasy/action demo script). The story beats, scene coverage, and dialogue are all correct. However, **visual quality is the critical blocker**: generated frames and clips look illustrated/cartoony rather than photorealistic.

The Supercomputer thread for Apex Hunter Siege contains a **complete, battle-tested realism framework** that was developed through iterative production work. This framework — consisting of a Realism Prompt Shield, Kinetic Physics Keys, and Reference Load Balancing — must be codified into the auto-pipeline. The problem is entirely solvable through prompt engineering and element quality, NOT through model upgrades.

### Apex Hunter Results (Latest — Post-Upgrade)
- **36 panels -> 13 multi-shot sequence clips -> 138 seconds**
- **QA score: 61/100** with 5 regen targets
- All video clips fulfilled via **MCP** (Cowork session -> Higgsfield platform -> PATCH back)
- Full script coverage with verbatim dialogue
- 7 character elements, 4 hero props, locked Aetheron set
- **Starting frames are illustration-quality, not photorealistic** — root cause identified: prompt engineering + element style

### WAYW Ep2 Results (Older — Pre-Upgrade)
- **22 panels -> 6 video clips -> ~42 seconds** (15 clips stuck in `pending_external`)
- **QA score: 58/100** with 4 regen targets
- Significant character/continuity drift

### Key Systemic Issues (Priority Order — Updated v4)
1. **P0 — Prompt engineering for realism** — Current prompts lack the Realism Prompt Shield directives. Must inject Live-Action Translation Directive, micro-texture descriptors, and strict negation block into every generation prompt. This is the #1 fix.
2. **P0 — Element style quality** — Elements created from illustrated/concept art references cause the AI to render in that style. Elements must be "raw photographic" quality. Upgrading element references to photorealistic images is critical.
3. **P0 — Location-as-element technique** — For many shots, skip Gemini first frame generation entirely. Use the approved location image as a Higgsfield Element with Seedance, letting the model compose the scene from elements + text.
4. **P1 — No Kling fallback when character is IP-blocked** — Pipeline falls back to text-only instead of trying Kling 3.0 with Elements.
5. **P1 — No rights-verification handling** — `pollHiggsfieldJob()` doesn't recognize `rights_verification` status.
6. **P1 — No Higgsfield REST API credentials on Vercel** — All video generation requires MCP fulfillment.
7. **P2 — "Ash" name-noun collision** — Case-insensitive regex in prompt engine.
8. **P2 — Reference Load Balancing not enforced** — Max 3 active elements per generation; overflow must be described textually.
9. **P2 — Play All button broken** — React key prop remounting kills sequential autoplay.
10. **P3 — No actual video stitching** — Assembly is manifest-only, no ffmpeg.

---

## 1. THE SUPERCOMPUTER REALISM FRAMEWORK (P0 — Implement Immediately)

This section documents the complete realism production methodology extracted from the Apex Hunter Siege Supercomputer thread (https://higgsfield.ai/supercomputer/5c69c8e9-fa18-406b-9033-ff35023ca085). This framework was developed through iterative production work and saved into the Supercomputer's `seedance-gotchas` skill as permanent production standards.

### Root Cause of Non-Realism

**The root cause is NOT the model** — it's the combination of:
1. **Illustrated element textures**: When reference elements (characters, props, environments) look like digital concept art or illustrations, the AI renders everything in that same style. "What was holding the realism back was the illustrated textures on the face and materials."
2. **Missing prompt physics**: Without explicit kinetic physics cues, generative video models produce "weightless" or "drifty" motion — characters slide instead of step, weapons glide instead of striking.
3. **Missing realism directives**: Without explicit anti-illustration instructions, the AI defaults to smooth, clean, oversaturated renders.

**The fix**: "By upgrading the primary portraits/environments to raw photography, the AI will seamlessly overlay the realistic skin, hair, and metallic textures onto the existing skeletal structures."

### A. The Realism Prompt Shield

**Inject these directives into EVERY generation prompt (images AND video):**

#### 1. Live-Action Translation Directive (prepend to all prompts)
```
Translate all referenced elements into raw high-fidelity live-action cinematic footage. 
Discard any painted, illustrated, or soft-render textures from the references, rendering 
them with tangible physical realism, skin pores, and detailed material dust.
```

#### 2. Factual Micro-Textures (add to character/scene descriptions)
Focus heavily on physical details:
- Skin: micro-pores, fine peach fuzz, emerging hair stubble, subsurface scattering
- Metal: battle-scratched matte steel plates, micro-scratches, oxidation
- Fabric: coarse fabric weaves, visible thread patterns, wear marks
- Environment: dust particles, weathered stone, organic debris

#### 3. Strict Negation Block (append to end of every prompt)
```
NEGATIVE: Do NOT render as 2D illustration, cartoon shading, outline vectors, 
cel-shading, digital painting, concept art, high-saturation color grading, 
smooth/waxy skin, vector-clean edges, or flat color fills. No anime, no 
illustration, no oversaturated fantasy palette.
```

### B. The Kinetic Physics Keys (Video Prompts Only)

To eliminate "weightless action drift" — characters sliding, weapons slicing like jelly — and replace with punchy, heavy action:

#### 1. Deceleration and Recoil
Write explicit physics into every action:
- "recoil vibration on impact"
- "hitting with massive physical resistance"  
- "coming to a sudden rigid stop"
- Forces the AI to render sharp deceleration curves at the end of movements

#### 2. Biomechanical Compression
Instead of simple movement descriptions, describe the physics:
- BAD: "he leaps into the air"
- GOOD: "knees bending deeply, body compressing with visible physical tension, then launching upward with sudden high velocity"

#### 3. Lock the Shutter Angle
Append camera physics to action prompts:
```
Fast shutter speed, 180-degree shutter angle motion blur on rapid action, 
rigid camera tracking.
```
This mimics the crisp, high-shutter-speed look used in blockbuster action scenes (Gladiator, 300) where movements are punchy rather than blurry.

### C. Reference Load Balancing (VRAM Management)

To prevent GPU Out-of-Memory (OOM) crashes during multi-element generations:

#### 1. Cap Active Element IDs
- **Maximum 3 core anchors per generation**: Lead Character + Primary Creature/Prop + Location
- Exceeding 3 complex 2K elements with intensive camera motion causes VRAM failures
- The Supercomputer's Clip 6 crashed when 3 complex 2K files were loaded with diagonal panning motion — fixed by describing the character textually instead of loading the element

#### 2. Translate Secondary Items to Text
- Describe secondary weapons, magical runes, and minor background actors TEXTUALLY inside the prompt
- Do NOT load their individual element IDs
- "This cuts memory bandwidth on the GPU nodes by over 50%, letting the job compile and generate instantly on the first pass"

### D. Element Quality Standards

#### Pose Sheets: Do NOT Regenerate
Pose sheets lock skeletal proportions, armor silhouettes, and garment geometry. The AI reads these structural guides correctly. "Regenerating the pose sheets would actually create a massive risk of wardrobe drift."

#### Character Portraits: MUST Be Raw Photographic
The primary character reference images must look like actual photographs, not digital art. If they look illustrated, the AI will render illustrated output.

#### Props: MUST Have Physical Textures
If weapon/prop elements look like "flat, clean, glowing digital concept art," the AI renders them as "flat, glowing neon bars (the 'lightsaber effect')." Props must show:
- Tactile physical metal surfaces
- Micro-scratches, oxidation, wear
- Practical material properties (weight, reflectivity)

### E. Production Standards (Saved from Supercomputer)

These were locked into the Higgsfield Supercomputer's persistent memory as default production standards:

| Standard | Value |
|----------|-------|
| Default character/spokesmodel gen | GPT Image 2 (not Soul Cast) |
| Failover rule | NEVER fallback to silent video engines on 503/timeout |
| Audio target | Premium immersive foley; absolutely no background music |
| Visual standard | Complete photorealistic blockbuster realism |
| Pose sheets | Structural guides only; do not regenerate |
| Element cap | Max 3 per generation; overflow described textually |

---

## 2. Location-as-Element Technique (P0 — New Workflow Path)

### The Insight
Khalil clarified that first frames are NOT always necessary:
> "Most times, you can just use the location as an element. If you just mention that location and explain the scene and tag all the characters and whatever props are in it, then the first frame isn't always necessary with Seedance."

### How It Works
Instead of:
```
Step 1: Generate Gemini first frame image for shot
Step 2: Upload first frame to Higgsfield  
Step 3: Generate video from first frame + elements
```

Use:
```
Step 1: Use approved location image as a Higgsfield Element
Step 2: Tag characters + props as elements in prompt
Step 3: Write detailed scene/action description
Step 4: Let Seedance 2.0 compose the scene directly from elements + text
```

### When to Use Which Path

| Condition | Path |
|-----------|------|
| Specific composition/framing required | Generate first frame |
| Standard scene in a known location | Location-as-element (skip first frame) |
| Close-up character shot | Character element only (no location needed) |
| Wide establishing shot | Location element + textual character descriptions |

### Implementation Impact
- Reduces Gemini API calls (no first frame needed for many shots)
- Avoids the first-frame-quality bottleneck entirely
- Better realism (Seedance composes from photographic elements, not from a potentially-illustrated Gemini render)
- Faster pipeline throughput

### Code Changes Required
The auto-pipeline orchestrator needs a decision function:
```typescript
function shouldGenerateFirstFrame(panel: StoryboardPanel): boolean {
  // Skip first frame when:
  // - Location element exists and is approved
  // - Shot type is standard (not extreme close-up or specific composition)
  // - All characters in the shot have approved elements
  // Return true only when specific framing/composition is needed
}
```

---

## 3. Starting Frame Realism Analysis (Updated from v3)

### Problem
Starting frames generated by Gemini look like illustrations/concept art rather than photorealistic film stills. Since Higgsfield animates FROM the starting frame, non-realistic frames produce non-realistic video.

### Root Cause (CORRECTED in v4)

**v3 incorrectly identified model tier as a potential cause.** The actual root causes are:

1. **Missing Realism Prompt Shield**: The current prompt says "PHOTOREALISTIC" and "NOT illustrated" but lacks the specific Live-Action Translation Directive, micro-texture requirements, and strict negation block that the Supercomputer framework uses. Adding these directives will dramatically improve output.

2. **No realism validation loop**: After generating the frame, there is NO automated check. The auto-selection step uses Claude Haiku vision but does not specifically evaluate photorealism vs. illustration style.

3. **Fantasy genre bias**: The fantasy/dark-fantasy setting may push the model toward concept-art style. The Realism Prompt Shield's explicit anti-illustration directives counter this bias.

4. **NOTE on models**: Per Khalil, newer models (Gemini 3.5, Nano Banana Pro, Nano Banana 2) CAN and DO achieve photorealism. Claude Code should independently research the latest available models for image generation. The model tier is NOT the bottleneck — prompt engineering is.

### Current Prompt (from `src/lib/generate-image.ts`, L531-551)
```
Generate a PHOTOREALISTIC FIRST FRAME for a film shoot — not a storyboard 
illustration, not a concept sketch.
...
Style: photorealistic cinematic frame, natural film grain, shallow depth of 
field where appropriate, production-quality color grading, NOT illustrated 
or animated.
```

### Required Prompt Upgrade
Replace with the full Realism Prompt Shield (see Section 1A):
```
[Live-Action Translation Directive]
Generate a first frame for a film shoot. This image will be used as shoot-day 
visual reference: composition, lighting, blocking, and costume must match 
production standards.
[Shot details, character details, location details]
[Factual Micro-Texture requirements for all visible characters/materials]
[Camera physics: Arri Alexa 65, specific lens, shutter angle]
[Strict Negation Block]
```

### Recommended: Realism Gate Step
Add step 11.5 between `first_frames` and `video_clips` — but ONLY when first frames are generated (skip for location-as-element path):
```
For each generated first frame:
  1. Score with vision model (Gemini 2.5 Pro or Claude Haiku):
     "Score 1-10 for PHOTOREALISM. Evaluate: skin texture/pores, 
      lighting physics, material properties, edge definition, 
      color palette naturalism, depth of field."
  2. If score < 7 OR style identified as 'illustration':
     a. Regenerate with enhanced Realism Prompt Shield
     b. Include failed frame as negative reference
     c. Up to 3 retries before needs_manual_review
  3. Log scores for QA dashboard
```

---

## 4. Higgsfield Elements Investigation

### "Error While Loading Media" — Status
All 50+ elements returned `status: "completed"` with valid CDN URLs via MCP API query. The "error while loading media" on the Higgsfield UI is likely a rendering/cache issue, not a data integrity problem.

### Two CDN Origins
| Origin | Type | Source |
|--------|------|--------|
| `d2ol7oe51mr4n9.cloudfront.net` | `media_input` (user upload) | Supercomputer phase |
| `d8j0ntlcm91z4.cloudfront.net` | `image_job` (Gemini-generated) | Auto-pipeline |

### Duplicate Elements — Cleanup Needed
The auto-pipeline created duplicate sets of every element. **26 elements exist for 12 unique assets.** Deduplicate by keeping the Supercomputer phase originals (manually curated, photorealistic quality) and removing `-1` suffixed and `Apex-` prefixed duplicates.

### Auto-Pipeline Fix
Before creating elements, check if matching elements already exist. Avoid creating duplicates of previously established references.

---

## 5. Gemini Video Analysis Capabilities (Confirmed)

Gemini 2.5 Pro supports native video input analysis. Key capabilities:
- **Inline base64** for clips under 20MB (our clips are 2-5MB)
- **Up to 10 videos per request**
- **Audio + visual analysis** simultaneously
- **Timestamp-based queries** at MM:SS precision
- **Token cost**: ~1,500 tokens per 5-second clip; 13 clips = ~19,500 tokens total

Higgsfield also offers `video_analysis_create` MCP tool for scene-by-scene structural analysis (3-5 min processing). **Use both**: Gemini for realism/quality scoring, Higgsfield for scene-level analysis.

---

## 6. Rayne IP Detection + Kling Fallback Chain (P1)

When Higgsfield's content policy blocks a character (Rayne — silver-white hair triggers resemblance flag):

**Required Fallback Chain:**
```
Attempt 1: Seedance 2.0 with <<<element_id>>> placeholders
  | (blocked)
Attempt 2: Reduce elements to character-only (drop environment/prop elements)
  | (still blocked)  
Attempt 3: Kling 3.0 with Elements (different model, may not trigger same policy)
  | (blocked)
Attempt 4: Text-only description (last resort — accept identity loss)
```

**Code Location**: `src/lib/generate-video.ts` — currently has no model fallback logic.

---

## 7. Rights Verification Gate (P1)

`pollHiggsfieldJob()` does not handle `rights_verification` status. Add:
```typescript
case "rights_verification":
  return { status: "rights_verification", url: null };
```
Surface in QA step so Khalil knows which clips need manual verification clicks.

---

## 8. What Changed Between WAYW and Apex Hunter (5 PRs)

| PR | What It Fixed | Impact |
|----|---------------|--------|
| **#16** | Multi-shot sequence clips, auto elements step, creature casting | Clips have real cut rhythm; elements auto-create |
| **#17** | Storyboard reads actual script text | Dialogue is verbatim, not invented |
| **#18** | Full-scene coverage rules | No more missing scenes |
| **#19** | Panel DB rows insert before art renders | Fixed silent half-scene truncation |
| **#20** | Run utilities + PROGRESS tracking | Better observability |

---

## 9. MCP vs. API — Definitive Answer

**All generation uses direct API calls:**
- **Images**: Google Gemini API via `@google/genai` SDK
- **Video**: Higgsfield REST API at `POST /v1/image2video/dop` — falls back to `pending_external` when no API keys set
- **Selection/scoring**: Anthropic Claude API -> `claude-haiku-4-5-20251001` vision

**In practice**: No Higgsfield API keys on Vercel, so all video generation uses MCP fulfillment path.

---

## 10. Priority Fix List for Claude Code

### P0 — Before Next Run (Realism Framework Implementation)

| # | Issue | File(s) | Action |
|---|-------|---------|--------|
| 1 | **Inject Realism Prompt Shield** | `src/lib/generate-image.ts` L531-551 + `src/lib/prompt-engine.ts` | Prepend Live-Action Translation Directive to all generation prompts. Add micro-texture requirements. Append strict negation block. This is the single highest-impact fix. |
| 2 | **Inject Kinetic Physics Keys** | `src/lib/prompt-engine.ts` (video prompts) | Add deceleration/recoil cues, biomechanical compression descriptions, and shutter angle physics to all video generation prompts. |
| 3 | **Location-as-element path** | `src/lib/auto-pipeline` orchestrator | Add decision function: when location element exists + characters have elements, skip Gemini first frame and use location-as-element with Seedance directly. |
| 4 | **Element quality audit** | `src/lib/auto-pipeline` elements step | When creating character/prop elements, verify they look photographic (not illustrated). Consider using GPT Image 2 for character generation per Supercomputer production standard. |
| 5 | **Reference Load Balancing** | `src/lib/prompt-engine.ts` | Hard cap at 3 elements per generation. Prioritize: Lead Character > Location > Key Prop. Translate all overflow to textual descriptions. |
| 6 | **Research newest models** | All generation code | Independently look up the latest available models (Gemini 3.5, Nano Banana Pro, Nano Banana 2, etc.). Do NOT rely on this report's specific model names — they may be outdated. |

### P1 — Critical Path

| # | Issue | File(s) | Action |
|---|-------|---------|--------|
| 7 | **Kling fallback chain** | `src/lib/generate-video.ts` | When Seedance blocks, retry with Kling 3.0 + Elements before falling back to text-only |
| 8 | **Rights-verification status** | `src/lib/generate-video.ts` -> `pollHiggsfieldJob()` | Add `rights_verification` case to status handler |
| 9 | **Higgsfield API keys on Vercel** | Vercel env config | Set credentials so video generation runs serverside without MCP |
| 10 | **Realism gate step** | New: `src/lib/realism-gate.ts` | Vision-model scoring of generated first frames for photorealism. Score < 7 triggers regeneration. Only applies when first frames are generated (not for location-as-element path). |

### P2 — Quality-of-Life

| # | Issue | File(s) | Action |
|---|-------|---------|--------|
| 11 | **Ash name collision** | `src/lib/prompt-engine.ts` | Word-boundary regex `\b${name}\b`, minimum name length for case-insensitive |
| 12 | **Play All button** | `src/app/projects/[id]/video/watch/page.tsx` | Remove key prop, persistent video element |
| 13 | **Element deduplication** | `src/lib/auto-pipeline` elements step | Check existing elements before creating duplicates |

### P3 — Future

| # | Issue | File(s) | Action |
|---|-------|---------|--------|
| 14 | **Video quality scoring** | New: `src/lib/video-quality-gate.ts` | Gemini 2.5 Pro video analysis for realism, motion quality, character consistency |
| 15 | **Higgsfield video analysis** | MCP tool: `video_analysis_create` | Complementary scene-level structural analysis |
| 16 | **Actual video stitching** | Assembly route | FFmpeg concatenation of approved clips |

---

## 11. Implementation Guide: Applying the Realism Prompt Shield

### For First Frame Generation (`generate-image.ts`)

**Current** `generateFirstFrame()` prompt construction (L531-551):
```typescript
const prompt = [
  productionDirectivePrefix(opts.productionNotes),
  `Generate a PHOTOREALISTIC FIRST FRAME for a film shoot...`,
  // ... shot details ...
  `Style: photorealistic cinematic frame, natural film grain...`
].filter(Boolean).join(" ");
```

**Required change** — wrap with Realism Prompt Shield:
```typescript
const REALISM_DIRECTIVE = `Translate all referenced elements into raw high-fidelity live-action cinematic footage. Discard any painted, illustrated, or soft-render textures from the references, rendering them with tangible physical realism, skin pores, and detailed material dust.`;

const REALISM_NEGATION = `NEGATIVE: Do NOT render as 2D illustration, cartoon shading, outline vectors, cel-shading, digital painting, concept art, high-saturation color grading, smooth/waxy skin, vector-clean edges, or flat color fills.`;

const prompt = [
  REALISM_DIRECTIVE,
  productionDirectivePrefix(opts.productionNotes),
  `Generate a first frame for a blockbuster film shoot.`,
  `Shot type: ${opts.shotType || "medium shot"}.`,
  `Camera angle: ${opts.cameraAngle || "eye-level"}.`,
  opts.cameraMovement ? `Camera movement implied: ${opts.cameraMovement}.` : "",
  `Action: ${opts.actionDescription}.`,
  charDetails ? `Characters (with physical micro-textures — visible pores, peach fuzz, subsurface scattering, fabric weave detail): ${charDetails}.` : "",
  `Location: ${opts.locationName}.`,
  opts.timeOfDay ? `Time of day: ${opts.timeOfDay}.` : "",
  opts.mood ? `Mood/atmosphere: ${opts.mood}.` : "",
  `Aspect ratio: ${aspect}. Compose for the final ${aspect} frame.`,
  `Camera: Arri Alexa 65, fast shutter speed, 180-degree shutter angle, production-quality color grading.`,
  `Materials: All surfaces show tactile physical properties — metal with micro-scratches, fabric with visible weave, stone with weathering.`,
  REALISM_NEGATION,
].filter(Boolean).join(" ");
```

### For Video Prompts (`prompt-engine.ts`)

Add Kinetic Physics Keys to all video generation prompts:
```typescript
const PHYSICS_KEYS = `Choreograph all motion with physical weight: deceleration and recoil on impacts ("recoil vibration on impact," "sudden rigid stop"), biomechanical compression on all athletic movements ("knees bending deeply, body compressing with visible physical tension"), fast shutter speed with 180-degree shutter angle motion blur on rapid action, rigid camera tracking.`;

// Prepend to every video prompt
function buildVideoPrompt(basePrompt: string): string {
  return `${REALISM_DIRECTIVE} ${PHYSICS_KEYS} ${basePrompt} ${REALISM_NEGATION}`;
}
```

### For Element Load Balancing (`prompt-engine.ts`)

```typescript
function applyElementPlaceholders(prompt: string, elements: Element[]): string {
  // Sort by priority: characters > locations > props
  const sorted = elements.sort((a, b) => priorityScore(b) - priorityScore(a));
  
  // Hard cap: max 3 element references
  const active = sorted.slice(0, 3);
  const overflow = sorted.slice(3);
  
  // Apply element placeholders for top 3
  let result = prompt;
  for (const el of active) {
    result = result.replace(
      new RegExp(`\\b${el.name}\\b`, "gi"), // Word-boundary fix for "Ash"
      `<<<${el.element_id}>>>`
    );
  }
  
  // Describe overflow elements textually (already in prompt from character descriptions)
  // No element ID injection — just natural language description
  
  return result;
}
```

---

## 12. Side-by-Side: Apex Hunter vs. WAYW Ep2

| Dimension | Apex Hunter Siege | WAYW Ep2 |
|-----------|-------------------|----------|
| Script type | Fantasy/Action (original) | Domestic drama (1990s sitcom) |
| Panels generated | 36 | 22 |
| Video clips | 13 (multi-shot sequences) | 6 (single panels) |
| Total runtime | 138s | ~42s |
| QA score | 61/100 | 58/100 |
| Dialogue accuracy | Verbatim from script (PR #17) | Paraphrased/invented |
| Character identity | Elements created, some IP blocks | No elements, significant drift |
| Video generation | MCP only (no API keys) | MCP only (no API keys) |
| Starting frame quality | Illustration style (prompt issue) | Unknown (not yet reviewed) |
| Model fallback | None — text-only on IP block | N/A (no character blocks) |

---

## 13. Appendix — Higgsfield Elements Audit

All elements returned `status: "completed"`. **26 elements exist for 12 unique assets** — significant duplication.

**Cleanup**: Keep Supercomputer phase elements (manually curated, photorealistic quality). Delete all `-1` suffixed duplicates and `Apex-` prefixed auto-pipeline duplicates.

**Auto-pipeline fix**: Check for existing elements before creating new ones.

---

## 14. Appendix — Supercomputer Thread Key Quotes

**On realism root cause:**
> "What was holding the realism back was the illustrated textures on the face and materials. By upgrading the primary portraits/environments to raw photography, the AI will seamlessly overlay the realistic skin, hair, and metallic textures onto the existing skeletal structures."

**On drifty motion:**
> "Generative video models like Seedance 2.0 can suffer from 'drift' or 'weightlessness' where characters slide rather than step, or sword strikes glide smoothly like jelly instead of hitting with a solid thud — because they lack kinetic physics keys in the prompt text. If an action is described smoothly, the AI renders it smoothly and floatily."

**On pose sheets:**
> "The pose sheets are structural guides — they lock in the skeletal proportions, armor silhouettes, and garment geometry. Regenerating the pose sheets would actually create a massive risk of wardrobe drift."

**On prop realism:**
> "If the registered elements for the weapons look like flat, clean, glowing digital concept art, the AI will render them as flat, glowing neon bars (the 'lightsaber effect') instead of physical weapons."

**On reference load balancing:**
> "Limit active element IDs to a maximum of 3 core anchors. Translate secondary props/characters to text. This cuts memory bandwidth on the GPU nodes by over 50%."

**Khalil on models (June 11, 2026):**
> "There's Gemini 3.5, Nano Banana Pro, Nano Banana 2 — these CAN achieve photorealism. That's not an issue because we do it all the time. I think we're gonna have to modify the prompts."

**Khalil on location-as-element (June 11, 2026):**
> "Most times, you can just use the location as an element. If you just mention that location and explain the scene and tag all the characters and whatever props are in it, then the first frame isn't always necessary with Seedance."

---

*End of Report v4*
