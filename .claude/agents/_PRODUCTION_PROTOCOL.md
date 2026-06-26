# AI Film Production — Shared Agent Protocol

> Every production agent reads this file first. It is the shared contract: the pipeline map,
> the lock-layer rules, the state discipline, and the known gotchas. Agents are THIN — they
> orchestrate the routes/scripts/connector below; they do not reinvent them.

## The current production target
- **Project:** Porcelain & Blood — Full Series. **project_id:** `b50b2748-265e-4288-a114-43e60842cfb8`
- **Supabase ref:** `onavhfhpdxwzdwotkddq`. Pipeline repo: `/Users/khalilchapman/Desktop/ai-film-pipeline`.
- **Bible (source of truth for canon):** `/Users/khalilchapman/Documents/Porcelain & Blood/`
- **Dev server:** `http://localhost:3000` (restart with `npm run dev` if down; routes are also on Vercel).
- DB access from scripts: use `@supabase/supabase-js` with `.env.local` (anon key); **run scripts from inside the repo** so `node_modules` resolves (scripts in `/tmp` can't import supabase-js).

## The pipeline (what the agents wrap)
Stages, in order, each backed by a route or script:
1. **Segment** — `node scripts/segment-episodes.mjs <project> --apply` → sets `scenes.episode_number` / `episode_title`.
2. **AVPS** — expand thin script → AVPS doc + continuity anchors (this is the new layer; see below).
3. **Elements** — create trained Higgsfield elements from bible assets; `node scripts/sync-registry.mjs <project> --apply` keeps `characters/locations/project_elements` pointed at the live element ids.
4. **Storyboard** — `POST /api/projects/[id]/storyboard` → `storyboard_panels`. *(External: Khalil's GPT-image storyboard app may replace this — see the `storyboard-dp` seam.)*
5. **Keyframes** — `POST /api/projects/[id]/first-frames {action:"plan_elements", panel_ids:[...]}` plans element-locked prompts; the connector renders them; `node scripts/fulfill-frames.mjs <project> --apply <results.json>` writes them back.
6. **Clips** — `POST /api/projects/[id]/video-clips` groups panels into multi-shot clips; the connector renders `seedance_2_0`; PATCH `video_clips` back.
7. **Assemble** — stitch clips in panel order. Local ffmpeg binary: `~/Library/Python/3.12/lib/python/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1`.
8. **QA** — `POST /api/projects/[id]/qa` → scores the cut vs the screenplay, writes `qa_reports`, pushes lessons to `pipeline_lessons`.

## The Higgsfield connector (the execution seam)
Vercel can't reach Higgsfield REST, so a Cowork/MCP session executes the image/video calls and PATCHes results back. The connector tools are session-scoped MCP tools — **load them via ToolSearch** (their server id changes per session):
- `ToolSearch "generate_image"`, `"generate_video"`, `"show_reference_elements"`, `"media_upload"`, `"media_confirm"`, `"job_display"`, `"show_generations"`.
- Inject a trained element into any prompt with `<<<element_id>>>`. The backend swaps it for the reference image.
- **Create an element:** `media_upload` → PUT bytes → `media_confirm` → `show_reference_elements action=create`.
- **Verify an element exists (audits):** prefer `show_reference_elements action=get element_id=<id>` per id, or `jq` the dumped list file — do NOT read the full `action=list` output inline (it's ~50K+ chars and overflows to a file).

## The LOCK LAYER (this is the spine — it prevents drift)
Drift is the #1 failure mode. Anything that must stay identical is LOCKED two ways:
1. **Trained elements** for anything that recurs scene-to-scene: faces, wardrobe/outfits, hero props (eye locket, backpack), locations. "If it crosses a generation, it's an element."
2. **AVPS continuity anchors** — written detail injected into EVERY relevant shot (backpack = brown leather/brass buckles/RIGHT shoulder; pink streak on LEFT; towel = plain white; weather; camera language).
Plus, in the keyframe planner (`src/lib/element-keyframes.ts`):
- **Wardrobe binds by character+scene** (`scenes.wardrobe`), injected on every shot a character is in — NOT by action-text keyword. (≥2 shared name-tokens to match, so "pirate" alone doesn't bleed Jing's outfit onto Zhan Bao.)
- **Locations resolve by shared token** ("EXT. THE NEPTUNE…" ↔ "PB-Neptune-Deck-V"). `null` = MISSING SET — flag it, never let the model improvise a background.
- **Spatial blocking** (which shoulder, who's where) is NOT covered by elements — needs **frame-chaining** (seed each clip from the approved prior keyframe).

## The AVPS format (the detail layer)
`04_episodes/episode_01/EP01_AVPS.md` is the template. An AVPS has: Episode Overview (purpose, emotional arc) · **Continuity Anchors** (world/weather, camera language, per-character wardrobe/hair/carries/state, recurring props → elements) · **Scenes** (director-grade beats, one block per shot). The anchors feed `scenes.wardrobe` + per-episode locks; the scene beats feed storyboard.

## STATE DISCIPLINE (required of every agent)
- **Read first:** load `brain.json` (key `ai_film_pipeline` / `porcelain_blood`), the relevant DB rows, and this protocol before acting.
- **Validate before commit:** after any `brain.json` edit run `python3 -c "import json;json.load(open('/Users/khalilchapman/Desktop/brain.json'))"`, then `git -C /Users/khalilchapman/Desktop add brain.json && commit`.
- **Write structured state, not just prose** — episode_number, wardrobe, element ids, qa_reports, pipeline_lessons. The next agent reads state, not your message.
- **Never `git add -A` in the bible folder** — `Characters/` holds large binaries; stage specific files only.
- **Concurrency:** another agent (or the daily portal-check) may write under you. If a file changed, re-read and re-apply.

## KNOWN GOTCHAS (learned the hard way)
- **Elements die silently** — the Higgsfield UI dedup can delete a bound element id mid-stream (`9e951dbc` died → re-pointed to `6af0bffd`). ALWAYS verify an element exists before generating; re-run `sync-registry` at session start.
- **Stale `production_notes`** poisoned every prompt (referenced a removed porcelain mule + "worker uniform"). Keep canon current; the mule is removed (the LOCKET triggers the time-fold).
- **Episode boundaries:** the script is microdrama — EP1 "Meet Jing" = pipeline Scenes 1–2 ONLY; EP2 = S3; EP3 = S4. Numbering restarts at Season 2. Use `episode_number`, never guess.
- **Base64 images in DB** — never `select("*")` on tables with image columns in bulk; use metadata-only selects.
- **Auth stub** — never add `.eq("user_id", …)`; the projects table has no user_id.
