# Auto-Pipeline Diagnostic Report v2

**Date:** June 11, 2026  
**Latest Run:** "Apex Hunter Siege" (Demo Script)  
**Apex Hunter Project ID:** `35387c49-5a98-42ca-8e3a-7580db5e1591`  
**Prior Run (WAYW Ep2):** `ce2c5a83-efb1-47d4-a3df-b6b279b42be8`  
**Pipeline URL:** https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app  
**Analyzed by:** Cowork (Claude Opus) — live site inspection, full code review, Claude Code session log review  

---

## Executive Summary

Two auto-pipeline runs have been completed. The **latest is Apex Hunter Siege** (a fantasy/action demo script), which ran AFTER 5 system-upgrade PRs (#16-#20) were shipped during the run itself. The older WAYW Ep2 run predates those upgrades.

### Apex Hunter Results (Latest — Post-Upgrade)
- **36 panels → 13 multi-shot sequence clips → 138 seconds**
- **QA score: 61/100** with 5 regen targets
- All video clips fulfilled via **MCP** (Cowork session → Higgsfield platform → PATCH back)
- Full script coverage with verbatim dialogue
- 7 character elements (headshot + pose sheet each, including the dragon), 4 hero props, locked Aetheron set

### WAYW Ep2 Results (Older — Pre-Upgrade)
- **22 panels → 6 video clips → ~42 seconds** (15 clips stuck in `pending_external`)
- **QA score: 58/100** with 4 regen targets
- No Higgsfield API keys on Vercel; only 6 clips manually fulfilled via MCP
- Significant character/continuity drift (Jeff wardrobe, Donna identity, bedroom set mismatch)

### Key Systemic Issues (Affecting Both Runs)
1. **No Higgsfield REST API credentials on Vercel** — video generation relies entirely on MCP fulfillment
2. **No model fallback chain** when Seedance/Kling blocks a character (Rayne IP flag on Apex Hunter)
3. **No rights-verification handling** in the polling loop
4. **No actual video stitching** — assembly is manifest-only
5. **Play All button broken** — React video element remounting kills sequential autoplay
6. **"Ash" name-noun collision** — prompt engine swaps character name into unrelated text
7. **Element cap needed** — ~4 reference elements per generation is the practical limit

---

## 1. What Changed Between WAYW and Apex Hunter (5 PRs)

These PRs shipped during the Apex Hunter run and represent permanent system improvements:

| PR | What It Fixed | Impact |
|----|---------------|--------|
| **#16** | Multi-shot **sequence clips** (3 panels per generation), auto **elements step**, creature casting, cast resilience | Clips now have real cut rhythm; elements auto-create from approved cast |
| **#17** | Storyboard reads **actual script text** (was only seeing 2-sentence scene summaries) | Dialogue is now verbatim from the script, not invented |
| **#18** | Full-scene coverage rules | No more missing scenes at the end of the storyboard |
| **#19** | Panel DB rows insert **before** art renders | Fixed silent half-scene truncation that hit 3 consecutive runs |
| **#20** | Run utilities + PROGRESS tracking | Better observability |

**WAYW Ep2 was run BEFORE these PRs.** Many of its issues (per-panel clips without cut rhythm, invented dialogue, truncated scenes) are now fixed. A re-run of WAYW through the current pipeline would likely produce significantly better results.

---

## 2. MCP vs API — How Is Generation Happening?

### Answer: ALL image generation uses direct API. ALL video generation uses MCP fulfillment.

| Component | Method | API/SDK |
|-----------|--------|---------|
| **Image generation** (casting, locations, scenes, first frames, storyboard) | Google Gemini API via `@google/genai` SDK | Model: `gemini-3.1-flash-image-preview` |
| **Video generation** | Higgsfield MCP fulfillment (Cowork session) | Clips submitted on Higgsfield platform UI, polled, PATCHed back |
| **Auto-selection** (best variation picker) | Anthropic Claude Haiku API | Model: `claude-haiku-4-5-20251001` |
| **Shot prompts** | Built in `src/lib/prompt-engine.ts` | Structured VISUALS/DIALOGUE/SFX/ELEMENTS format |

### Why MCP Not REST?
`HIGGSFIELD_API_KEY` and `HIGGSFIELD_API_SECRET` are **not set** in Vercel environment variables. When `authHeader()` in `generate-video.ts` returns null, every clip falls to `pending_external` status. Claude Code then fulfilled each clip manually:
1. Read the pending clip's prompt + model selection from the DB
2. Submitted jobs to Higgsfield platform via the MCP connector
3. Polled for completion
4. PATCHed the video_url back to the clip row

### REST API Limitation (Even If Keys Were Set)
The REST path sends ALL clips as `dop-turbo` (hardcoded default), regardless of the intent-model selection (`seedance_2_0`, `cinematic_studio_3_0`, `kling3_0`). Per-model routing only works via MCP. The code comment states: *"The intent labels stay useful for MCP fulfillment, which can route per model."*

### Recommendation
**Continue with MCP fulfillment as the primary path** until Higgsfield REST API supports:
- Per-model routing (not always dop-turbo)
- Element resolution (<<<element_id>>> placeholders)
- Rights verification handling

Optionally set API keys as a backup for simple shots, but MCP remains the quality path.

---

## 3. Quality: "Cartoony" vs "Blockbuster Ultra Realistic"

### First Frames (Gemini Stills) — Photorealistic
Visual inspection of both projects shows **photorealistic, cinematic-quality stills**. The prompts include strong realism anchors: `"PHOTOREALISTIC FIRST FRAME for a film shoot"`, `"photorealistic cinematic frame, natural film grain, shallow depth of field"`. Character identity references are passed as multimodal inline data.

### Video Clips — Quality Depends on Fulfillment Path

**MCP-fulfilled clips (Apex Hunter):** These were generated on the Higgsfield platform with proper model selection (Seedance 2.0 for characters, etc.) and Element references resolved. Claude Code reported that "elements resolved beautifully — all 4 references attached." Quality should match semi-manual runs.

**REST-fulfilled clips (if API keys were set):** Would use `dop-turbo` for everything, Elements wouldn't resolve, and quality would degrade — this is likely what produces the "cartoony" look.

### The Actual Quality Issue
From the Apex Hunter QA report, the quality concerns aren't about realism per se — they're about **fidelity to the script's visual directions**:
- Dragon appears mid-sized instead of city-eclipsing
- Bone wings rendered as leathery bat-wings
- Soldiers in modern tactical gear instead of fantasy armor
- Camera angles not matching scripted directions (bird's-eye crane-down → ground-level composite)

These are **prompt execution accuracy** issues, not "cartoony" rendering. The video models render realistically but don't always follow the specific visual direction in the prompt.

### Recommendations
1. **Stronger visual constraint language** in prompts — more explicit "MUST" directives for scale, wing anatomy, costume period
2. **Negative prompt emphasis** — "NO modern clothing, NO tactical gear, NO contemporary equipment"
3. **Reference image guidance** — pass concept art for specific visual elements (wing type, armor style) as additional inlineData
4. **QA regen loop** — the 5 regen targets from the QA report are precisely the panels that need re-prompting

---

## 4. Rayne IP Detection + Missing Kling Fallback (Khalil's Key Concern)

### What Happened
During the Apex Hunter run, **Rayne (the silver-haired hunter protagonist) repeatedly triggered Higgsfield's IP/likeness detector**. Claude Code's session log documents:

- Panel 16 failed 3 times on the meteor-crash beat
- The trigger is the "silver-haired hunter vs dragon" composition, not a specific reference image
- IP detection is **probabilistic on output**, not deterministic on inputs — re-rolling sometimes works
- Final fallback: dropped the Rayne Element entirely and described him textually

### What Should Have Happened (from Khalil's semi-manual workflow)
When Seedance blocks a character:
1. **Auto-retry** same model (probabilistic — may pass on re-roll)
2. If still blocked, **fall back to Kling 3.0** with Elements to maintain identity
3. If Kling also blocks, **drop to text-only description** (last resort — loses identity lock)

### Current Code: No Fallback Logic
```typescript
// generate-video.ts — selectVideoModel() picks ONCE, no retry chain
export function selectVideoModel(req: VideoGenRequest): HiggsfieldModel {
  if (req.charactersInShot.length > 0) return "seedance_2_0";
  if (shot.includes("wide") || shot.includes("establishing")) return "cinematic_studio_3_0";
  return "kling3_0";
}
```

When the chosen model fails, `generateVideoClip()` returns `{ status: "failed" }` and the orchestrator retries **with the same model** up to 2 times. There's no model-downgrade or fallback chain.

### Fix Required — Model Fallback Ladder
```typescript
const FALLBACK_CHAIN: HiggsfieldModel[] = ["seedance_2_0", "kling3_0"];

async function generateWithFallback(frameUrl, req) {
  const primaryModel = selectVideoModel(req);
  const chain = [primaryModel, ...FALLBACK_CHAIN.filter(m => m !== primaryModel)];
  
  for (const model of chain) {
    const result = await tryGenerate(model, frameUrl, req);
    if (result.status === "completed") return result;
    if (result.error?.includes("nsfw") || result.error?.includes("IP")) {
      console.log(`Model ${model} blocked, trying next in chain...`);
      continue;
    }
    // Non-content failure — don't cascade, just retry same model
    break;
  }
  
  // Last resort: text-only (drop Element references)
  return tryGenerate("kling3_0", frameUrl, { ...req, registryElements: [] });
}
```

---

## 5. Rights Verification Gate

### Issue
Some Higgsfield generations require a **manual "rights verification" button click** on the platform before the video is released. The REST poller and MCP fulfillment both submit the job and poll for completion, but if the job enters a verification-pending state, it appears to fail/timeout.

### Current Handling: None
`pollHiggsfieldJob()` recognizes: `completed`, `failed`, `error`, `nsfw`, `queued`, `in_progress`. No handling for `rights_verification`, `pending_verification`, or similar statuses. An unrecognized status would be treated as "keep polling" until the 200-second timeout, then parked as `pending_external`.

### Fix Required
1. Add status detection: `if (s === "rights_verification" || s === "pending_rights" || s === "verification_required")`
2. Surface in UI with a "Verify on Higgsfield →" button linking to the job
3. Don't count these as failures or retries in the orchestrator
4. For MCP path: have the Cowork session click the verification button automatically

---

## 6. "Ash" Name-Noun Collision in Prompt Engine

### Issue (from Claude Code's session)
The prompt engine's `applyElementPlaceholders()` swaps character names for `<<<element_id>>>` placeholders. The character "Ash" collides with the common English word "ash" (as in fire debris). Claude Code reported: *"the prompt engine swapped the character into 'blood and ash on his face.'"*

### Root Cause
The regex `\b${escapeRe(term)}(?:'s)?\b` is case-insensitive (`"gi"` flag in prompt-engine.ts line 78). So "ash" in "blood and ash" matches the character "Ash."

### Fix Required
For short/ambiguous names, use **case-sensitive matching** or require a minimum context (e.g., "Ash" only matches when capitalized or when followed by a verb/possessive). The prompt engine already sorts by term length (longest first), but this doesn't help with single-word names.

---

## 7. Element Cap (~4 per generation)

### Issue (from Claude Code's session)
*"~4 reference elements per generation is the practical cap with a start image — the prompt engine should rank and cap, pushing overflow into continuity text."*

When too many Elements are referenced in a single prompt + start image, Higgsfield's model quality degrades or the generation fails.

### Fix Required
Add element ranking and capping in `buildMotionPrompt()`:
1. Rank elements by relevance to the shot (characters in frame > props visible > environment already locked via location)
2. Cap at 4 elements per generation
3. Demote overflow elements from `<<<element_id>>>` placeholders to text descriptions in a CONTINUITY section

---

## 8. Play All Button Bug

### Root Cause (confirmed on both projects)
The `<video>` element uses `key={current.clip_id}`, causing React to unmount/remount on each clip change. This breaks the browser's autoplay user-gesture chain.

### Fix
Remove the key prop, use a persistent `<video>` element that swaps `src` + calls `.load()`:
```tsx
<video ref={videoRef} src={current?.video_url} controls onEnded={handleEnded} />

useEffect(() => {
  if (playing && videoRef.current) {
    videoRef.current.load();
    videoRef.current.play().catch(() => setPlaying(false));
  }
}, [clipIndex]);
```

---

## 9. No Video Stitching

Assembly remains manifest-only. The code explicitly states Vercel can't run ffmpeg. The "Screening Room" plays clips sequentially as a playlist.

### Options
1. **Local script** — `scripts/stitch-film.mjs` using ffmpeg on Khalil's machine
2. **Cloud stitcher** — Creatomate, Shotstack, or Supabase Edge Function
3. **Client-side** — MediaRecorder API (lower quality, zero infrastructure)

The watch page already detects `assembly.video_url` and renders a single-file player with download button when it exists.

---

## 10. Apex Hunter QA Details (Score: 61/100)

### Character Consistency Issues
- **Ash**: Appears prematurely in Panel 1 (should be dramatic reveal later). Inconsistent hair: redheaded boy in P1, dark-haired teen in P11/P13/P19/P33
- **Abyssal Dragon**: Bone wings rendered as leathery bat-wings. Scale shrinks between P1 and later wides. Only P9 (ECU eye) has correct skeletal anatomy
- **Soldier**: Modern tactical gear breaks the fantasy visual grammar (anachronistic)

### Mood Alignment Issues
- **P1**: Expected sky-blotting dragon, got ground-level disaster tableau with Ash foregrounded
- **P21**: Expected quiet rising hope (survivors + whispered chant), dragon still prominent/active
- **P33**: Expected climactic dragon collapse, dragon still airborne fighting
- **P35**: Caster has glowing orange eyes (Rayne's exclusive trait) — character identity bleed

### 5 Regen Targets
1. **S1·P1** — Camera angle wrong, Ash shouldn't appear, dragon must be city-eclipsing, bone wings, dusk sky
2. **S1·P33** — Dragon collapse beat missing entirely, needs frozen→crashing sequence
3. **S1·P35** — Caster has Rayne's eye glow, needs normal eyes with tears
4. **S1·P31** — Rayne's golden eye glow absent (contradicts transformation from P27)
5. **S1·P21** — Dragon too prominent in background, survivors/chant should be center

---

## 11. Priority Fix List for Claude Code

### P0 — Critical

| # | Fix | File(s) | Effort |
|---|-----|---------|--------|
| 1 | **Model fallback ladder** (Seedance → Kling → text-only) for blocked characters | `generate-video.ts` | Medium |
| 2 | **Fix Play All button** — remove key prop, swap src + load() | `video/watch/page.tsx` | Small |
| 3 | **"Ash" name-noun collision** — case-sensitive matching for short/ambiguous names | `prompt-engine.ts` | Small |

### P1 — High

| # | Fix | File(s) | Effort |
|---|-----|---------|--------|
| 4 | **Rights-verification status handling** in pollHiggsfieldJob | `generate-video.ts` | Medium |
| 5 | **Element cap (~4 per generation)** — rank, cap, demote overflow to text | `prompt-engine.ts` | Medium |
| 6 | **Cross-panel continuity prompting** — wardrobe/prop state + previous panel reference | `generate-image.ts` | Large |
| 7 | **Implement video stitching** — local ffmpeg script or cloud service | New file + `assembly/route.ts` | Large |

### P2 — Medium

| # | Fix | File(s) | Effort |
|---|-----|---------|--------|
| 8 | **Update CLAUDE.md** — Gemini model is `gemini-3.1-flash-image-preview` | `CLAUDE.md` | Trivial |
| 9 | **REST model routing** — if API keys are ever set, map intent model to actual model param | `generate-video.ts` | Small |
| 10 | **QA regen auto-trigger** — when QA identifies targets, auto-regenerate those panels | `auto-pipeline/route.ts` | Medium |

### P3 — Nice to Have

| # | Fix | File(s) | Effort |
|---|-----|---------|--------|
| 11 | **Clip URL expiry handling** — refresh/re-download Higgsfield CDN URLs | `video-clips/route.ts` | Small |
| 12 | **NSFW content softening** — auto-retry with softened prompt when content-blocked | `generate-video.ts` | Medium |
| 13 | **Assembly validation** — warn when >30% panels missing before allowing assembly | `assembly/route.ts` | Small |

---

## Appendix A: Key File Locations

| File | Purpose |
|------|---------|
| `src/lib/generate-image.ts` | All Gemini image generation |
| `src/lib/generate-video.ts` | Higgsfield REST API, model selection, polling |
| `src/lib/prompt-engine.ts` | Structured video prompts + Element placeholder swaps |
| `src/lib/auto-select.ts` | Claude Haiku vision scoring |
| `src/app/api/projects/[id]/auto-pipeline/route.ts` | 15-step orchestrator |
| `src/app/api/projects/[id]/video-clips/route.ts` | Video clip generation with sequence grouping |
| `src/app/api/projects/[id]/assembly/route.ts` | Manifest-based assembly |
| `src/app/projects/[id]/video/watch/page.tsx` | Screening Room / Watch page |

## Appendix B: Apex Hunter vs WAYW — Side by Side

| Metric | WAYW Ep2 (pre-upgrade) | Apex Hunter (post-upgrade) |
|--------|------------------------|---------------------------|
| Panels | 22 | **36** |
| Clips with video | 6 of 22 (27%) | **13 of 13 (100%)** |
| Runtime | ~42s | **138s** |
| QA Score | 58/100 | **61/100** |
| Dialogue | Partially invented | **Verbatim from script** |
| Sequence clips | No (per-panel) | **Yes (3 panels/clip)** |
| Elements | None | **7 characters + 4 props + 1 set** |
| Video fulfillment | 15 stuck pending | **All via MCP** |
| Regen targets | 4 | 5 |

## Appendix C: PRs Shipped During Apex Hunter Run

- [#16](https://github.com/kchap2000/ai-film-pipeline/pull/16) — Multi-shot sequence clips, auto elements, creature casting
- [#17](https://github.com/kchap2000/ai-film-pipeline/pull/17) — Storyboard reads actual script (fixes invented dialogue)
- [#18](https://github.com/kchap2000/ai-film-pipeline/pull/18) — Full-scene coverage rules
- [#19](https://github.com/kchap2000/ai-film-pipeline/pull/19) — Panel rows insert before art renders (fixes truncation)
- [#20](https://github.com/kchap2000/ai-film-pipeline/pull/20) — Run utilities + PROGRESS

---

*Report generated from: live site inspection of both projects, full source code review, Claude Code Apex Hunter session log analysis, and Higgsfield platform history review.*
