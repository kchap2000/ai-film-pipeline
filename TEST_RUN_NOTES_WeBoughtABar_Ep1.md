# Test Run Notes — "We Bought a Bar" Ep1 (auto pipeline)

Live log of what worked, what didn't, and what needs updating. Running the full
auto pipeline on a fresh series/script the day after the realism+consistency pass
(PRs #34/#35 merged). Production app: ai-film-pipeline (Vercel, main).

---

## WHAT WORKED ✅

- **Script ingest as `.md`** — the app only accepts `application/pdf`, DOCX, and
  `text/plain` (`src/app/api/upload/route.ts` ACCEPTED_TYPES). Workaround: upload the
  `.md` with `Content-Type: text/plain` and it parses fine. **NEEDS UPDATE:** add
  `text/markdown` + `.md` to ACCEPTED_TYPES so users can upload markdown directly.
- **Setting profile extraction (2010 era) — excellent.** From the script + production
  notes, extraction derived a precise `setting_profile`: era "2010", a 16-item
  `forbidden` list (smartphones, modern cars, LED signage, QR codes, vaping, drone/
  gimbal aesthetic…), 6 `wardrobe_rules`, and a technology_level paragraph. This is
  exactly what the new anachronism gate needs. The hardened gate then passed every
  cast/location pick at 8–10/10 with era-aware reasoning.
- **Casting + reference gate** — Khalil 9/10, Local Man 10/10, Nicole 8/10 (generated
  from scratch, no source headshot). Gate reasoning explicitly referenced "2010s
  honeymoon wardrobe" and "authentic older Costa Rican man" — anachronism awareness is
  working end to end.
- **Pose sheets** — all passed the identity gate on first attempt (now on Pro model).
- **9:16 + auto mode** — created and ran hands-off through casting → pose → locations →
  scene scouts → storyboard with no manual intervention.

## WHAT DIDN'T WORK / NEEDS UPDATING ⚠️

- **Character physical descriptions were missing** when only the episode script was
  uploaded. The script says "No physical description provided in script — awaiting
  production notes," so Khalil/Nicole were cast generically (the gate even noted "the
  physical match cannot be fully verified"). The rich descriptions (Khalil's
  dreadlocks w/ blonde tips + cream linen; Nicole's curly brown hair + floral sundress;
  Local Man's long locs + beard) live in `SEASON1_ProductionSpec.md`, a SEPARATE file.
  **FIX for this run:** upload BOTH the episode script AND the production spec so
  extraction merges scene/dialogue (script) with character bible (spec).
  **NEEDS UPDATE (product):** make multi-file ingest a first-class flow — a "series
  bible" doc that travels with every episode, or a project-level character bible the
  episode extraction reads from.
- **Verbose / duplicated locations** — extraction produced 4 near-identical Driftwood
  rows ("…Sign", "…Exterior", "…Exterior and Interior Threshold", "…Exterior and
  Threshold") instead of 2–3 clean ones (Beach Road, Driftwood Exterior, Driftwood
  Interior). Same compound-location-name issue seen on WAYW. Each spawned its own 5
  scout variants (wasted gens). **NEEDS UPDATE:** dedupe/normalize location names at
  extraction (Haiku normalization pass) so one set = one location.
- **No Higgsfield REST creds in prod** — video clips queue as `pending` and need the
  local CLI runner (`scripts/fulfill-clips.mjs`) to actually render. Expected, but
  means "full auto" still needs one local command for video.

## TIMINGS (first partial run, seconds)

cast_generate 392 · cast_select 90 · pose_sheets 141 · locations_generate 249 ·
locations_select 137 · scenes_generate 304 · scenes_select 120 (Pro model ≈ slower
but more photoreal — expected tradeoff from the realism pass).

## 🔴 BLOCKER FOUND — extraction times out (60s function cap)

`POST /api/extract` returns **504 FUNCTION_INVOCATION_TIMEOUT at ~60s**, repeatably
(5/5 retries). Root cause: the route declares `export const maxDuration = 300`, but the
**production deployment does not honor >60s** (Hobby-tier behavior). Extraction is one
big Claude Sonnet call (max_tokens 8192) that sits right at the 60s boundary — the very
first run squeaked under (~50s, thin character output); adding the production bible, or
just generation-time variance, pushes it over and it gets killed. Confirmed it is NOT
input size (failed even on the trimmed episode-only file).

**This is the single most important thing to fix for real client use.** Options:
1. Put the Vercel project on a plan/region that honors `maxDuration` (Pro = 300s). Best fix.
2. Speed extraction under 60s: smaller `max_tokens`, or a faster model (Haiku) for a
   first pass, or split into two calls (characters+setting, then scenes) so each fits.
3. Make extraction a background job (insert a `generation_jobs` row, run async, poll) so
   it is never bound by a single request's wall-clock.

**Workaround used for this run:** seeded the extraction directly into the DB via a local
node script using the anon key (same writes the route does) — characters (with the FULL
bible descriptions), 3 clean locations, 8 scenes, `setting_profile`, `script_text`,
`phase_status=bible`. Then started the orchestrator at `cast_generate` (skipping extract).
This also let me fix the two earlier issues in one move: rich character descriptions +
deduped locations (3 clean vs 4 verbose). Extraction logic itself is already validated
(first run produced an excellent setting_profile + 8 scenes) — the blocker is purely the
60s cap, not the pipeline.

## 🟡 ALSO: extract route only accepts pdf/docx/text-plain — add `.md`

`ACCEPTED_TYPES` in `src/app/api/upload/route.ts` rejects `text/markdown`. `.md` uploads
must be sent as `text/plain`. Quick fix: add `"text/markdown"` to ACCEPTED_TYPES and map
`.md` → text. (Khalil flagged this directly.)

## RUN A — AUTO-GEN (Gemini-cast) — project 199b607c

Drove cast → gates → pose → locations → scenes → storyboard → first_frames. All gates
passed 8–10/10 with era-aware reasoning; reached `first_frames` then got **paused** (the
local driver process died when /tmp was wiped on a machine restart — see below). The run
state is safe server-side; resumable. This validated the AUTO path + anachronism gates.

## RUN B — LOCKED-REFERENCE run (Khalil's real assets) — project 467328bf

Per SEED_TEST_RUN.md: skip casting/location scouting, seed Khalil's real curated headshots,
pose sheets, and Driftwood photos as the locked identity/environment anchors, then run
storyboard → first_frames → video. This is the higher-fidelity test.

### Findings from the seeded setup
- **`scripts/seed-locked-assets.mjs` `LOLM_ROOT` was wrong.** It pointed at
  `/Users/khalilchapman/Desktop/The Life of The Lazy Mon` (which only holds the old Maiden
  Voyage project). The real S1 assets live under
  `/Users/khalilchapman/Documents/Claude/Projects/The Life of The Lazy Mon`. **FIXED** the
  constant. NEEDS UPDATE: make the asset root a CLI arg / env var, not a hardcoded path.
- **Large reference images break the insert.** Khalil's headshot is 7.9MB, the Driftwood
  beach ref 5MB → base64 >10MB. Inserting that into a single row caused a Supabase
  **"canceling statement due to statement timeout"** on one scene-scout update. **FIXED** by
  adding an on-the-fly `sips` downscale (JPEG, max 1600px) to `fileToBase64` for anything
  >3MB, and a retry on the scout update. NEEDS UPDATE: bake the downscale into the seed
  script permanently (done locally) and/or store references in Storage + URL instead of
  base64-in-DB for big files.
- **The seed script assumes extraction already ran** (it reads existing characters/
  locations/scenes), but extraction 504s (see blocker above). So the order is: self-seed
  the extraction FIRST (names must match the asset maps — UPPERCASE KHALIL/NICOLE/LOCAL MAN
  and the 6 exact location names), THEN run seed-locked-assets. Worked once aligned.
- **SEED_TEST_RUN.md `type: "short_film"` is invalid** — the projects API only accepts
  `personal`/`client`. Used `personal`.
- **Aspect mismatch in the doc**: SEED_TEST_RUN's production_notes say 2.39:1, but the
  episode is vertical 9:16 and the Driftwood refs are 16:9. Used 9:16 (the series format);
  16:9 refs as environment anchors are fine (Gemini reframes to 9:16).

### Seed result (all locked)
KHALIL/NICOLE/LOCAL MAN — real headshots locked, pose sheets for Khalil+Nicole; 6 Driftwood/
road reference images approved + Higgsfield element IDs (Nicole 5ab95090…, Driftwood
5eeb00a7…); all 8 scene scouts attached. Started orchestrator at `storyboard`.

### 🔴 BLOCKER 2 — storyboard step also exceeds the 60s cap
The storyboard step does a Claude shot-breakdown PLUS multiple Pro-model panel renders
in ONE request. With the slower Pro models (from the realism pass) this blows past 60s and
504s. Panel ROWS commit before the kill, so it limped scene-by-scene, but scenes 4–8 never
landed (their breakdown alone exceeded 60s). Same root cause as the extraction blocker:
**the deployment does not honor `maxDuration=300`.** First_frames is fine because it's
one generation per request.

### 🔴 BLOCKER 3 — auto shot-breakdown is wildly over-dense for short-form
The Claude breakdown produced **49 panels for the 4-second HOOK**, 117+ total for a
~90-second episode. The shot-density prompt (`storyboard/route.ts`, "14–24 shots for
action, 8–14 for dialogue") is tuned for long-form and has no per-episode cap. For a
vertical microdrama this should be ~15–25 TOTAL shots. **NEEDS UPDATE:** cap total shots
by target runtime (e.g. ceil(runtime_seconds / 4)) and bound shots-per-beat to ~1–4.
Workaround for this run: replaced the 117 auto panels with a clean hand-authored 15-shot
storyboard, then ran first_frames on that.

### ✅ THE REAL RESULT — 3-axis gate on the LOCKED references
First frames on the 15-shot cut, scored live by the new gate:
- **Realism 9/10** — the Pro photoreal prompt is working; frames read as captured photos.
- **Beat fidelity 10/10** — frames depict the scripted moment.
- **Identity 2/10 → 6/10 after the boost re-roll** — THE WEAK AXIS. Gemini Pro cannot
  faithfully reproduce Khalil/Nicole's REAL locked headshots from a single reference image;
  the identity gate correctly catches the drift and re-rolls, but the model only reaches
  ~6/10 (recognizable-ish, not a true likeness). Environment/Driftwood frames score 9–10.

**Implication (the headline takeaway):** for real specific people, one-shot Gemini
reference matching isn't enough — use Higgsfield character **Elements** (trained identity
models; Nicole already has `5ab95090…`) for the cast, and keep Gemini Pro for environments
/ props / non-likeness shots where it scores 9–10. The gate is doing its job; the model is
the limiter on human likeness.

### RUN COMPLETE — 15 first frames generated, 15 clips queued pending, assembly deferred.
Frames saved to `~/Desktop/LOLM_Ep1_TestFrames/`. Visual verdict below.

## VISUAL VERDICT (looked at the actual frames)

**Environments / atmosphere / era — OUTSTANDING (9–10/10).**
- The Driftwood establishing: golden-hour, hand-painted "THE DRIFTWOOD" sign, weathered
  stilts, broken louvered shutters, ocean behind, palm-frond dirty-frame — gorgeous, and
  faithful to the locked reference. The sign-wipe hero shot even rendered "Bar, Puerto
  Viejo 2010" on the board.
- Beach road + Local Man: rusty bicycle, unpaved road, faded turquoise buildings, palms,
  golden hour. Zero anachronisms in any frame — the 2010 setting_profile + negative prompt
  held perfectly. The whole series LOOK (camera/grade/9:16/dirty-frame) is locked.

**Human identity — MODERATE, the weak axis (~6/10).** People are photoreal and
type-consistent but NOT faithful to the real locked headshots, and they drift shot-to-shot
(Nicole's face/hair changes between her close-up and the trio). The identity gate correctly
flagged ~2/10 and re-rolled to ~6/10 — the model is the limiter, not the gate.

**Wardrobe not enforced — Nicole rendered in a bikini top in 2 shots instead of the
specified floral sundress.** Per-character wardrobe needs to be a hard constraint in the
frame prompt, not just the description. The Local Man (tank top) and Khalil read fine.

**Minor:** slight sign-text garble in the wide ("DRIFTWOOOD"); a known Gemini text quirk.

## RECOMMENDED FIXES (priority order)
1. **Fix the 60s function cap** (Vercel Pro / honor `maxDuration=300`, or make
   extraction + storyboard async). Unblocks the auto path end-to-end. #1 by far.
2. **Cap shot density for short-form** — scale total shots to runtime (~1 shot / 3–4s,
   so a 90s episode ≈ 20–25 shots, not 117). Bound shots-per-beat.
3. **Use Higgsfield character Elements (trained identity) for the cast**; keep Gemini Pro
   for environments/props/signage where it scores 9–10. This is the real path to faithful
   likeness. (Nicole already has element `5ab95090…`.)
4. **Make per-character wardrobe a hard constraint** in first-frame + storyboard prompts
   (Nicole's sundress was ignored).
5. **Accept `.md`** uploads; **un-hardcode** the seed script's asset root + bake in the
   image downscale.

## BOTTOM LINE
The pipeline produces genuinely beautiful, era-accurate, on-brand ENVIRONMENT and atmosphere
frames at the new Pro photoreal quality, and the 3-axis gate works exactly as designed —
it cleanly separates "great" (world, 9–10) from "needs work" (human likeness, 6). For a
shippable episode: switch the people to Higgsfield Elements, fix the 60s cap so the auto
path runs unattended, and cap shot density. The environment/world half is essentially
production-ready today.
