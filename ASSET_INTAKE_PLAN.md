# Asset Intake & Project Bootstrap — Plan

> **The goal:** point the system at a pile of stuff you already have — a script, a
> bible, character headshots, pose sheets, location photos, prop refs, Higgsfield
> element IDs — and it figures out what each thing is, maps it to the story, tells
> you **exactly what's missing**, generates **only** the gaps, and runs to a
> finished episode. No hand-wiring, no "regenerate everything," no surprises.
>
> This is the productized version of what we did manually in the "We Bought a Bar"
> locked-reference run (`scripts/seed-locked-assets.mjs` + hand-matched names +
> manual gap fill). Read after FINAL_VISION.md.
>
> **STATUS (2026-06-15): BUILT + TESTED — branch `feature/asset-intake`.**
> - **`scripts/intake.mjs`** — the full CLI (I1+I2+I5). Tested end-to-end on the
>   WBAB asset bundle: scanned 11 files, extracted the story LOCALLY (full season
>   bible, no 60s cap), episode-scoped the characters (4, not the whole-season 8),
>   classified images (convention + Claude vision), matched by token-overlap
>   ("Puerto Viejo Beach Road" ↔ "Beach Road — Puerto Viejo"), locked 3 real
>   headshots + 2 pose sheets + location refs + scene scouts + element IDs (Nicole
>   `5ab9…`, Driftwood `5eeb…`), and printed the readiness report.
>   Usage: `node scripts/intake.mjs <folder> --project "Title" --runtime 90 --element-map elements.json [--run]`
> - **I4** — orchestrator now skips locked/approved characters + locations
>   (generate only gaps); storyboard honors a hard per-scene shot cap derived from
>   target runtime (fixes the 117-panels-for-90s problem).
> - **I3** — `GET /api/projects/:id/readiness-report` + a **Readiness tab** in the
>   Hub (per-entity ✓/✗ grid + "Fill gaps & run"). API tested live against the
>   intake-seeded project.
> - Not done: in-app drag-drop upload (the CLI is the on-ramp today); async
>   server-side extraction (the CLI does it locally instead, which sidesteps the
>   60s cap entirely); PDF/DOCX intake (convert to .md/.txt for now).

---

## WHY (the recurring pain)

Most real episodes start with assets already in hand. Khalil's words: *"a lot of
times we have the characters already, we have the assets, and we just need it to
build out the finished episodes."* Today the pipeline gives you two bad options:

- **Auto mode** ignores your assets and re-generates everyone from scratch (wrong
  faces, wasted credits).
- **Locked-reference mode** uses your assets but requires an engineer to hand-write
  a name→file map, fix hardcoded paths, downscale images, align extraction, and
  babysit it (exactly what the test run needed).

Intake closes that: **bring what you have, the system locks it, finds the gaps,
fills only those, and runs.**

---

## THE FLOW (5 stages)

```
  DUMP  →  CLASSIFY  →  MAP  →  READINESS GAP REPORT  →  FILL GAPS  →  RUN
 (folder/   (what is    (which   ("ready to run" or     (generate    (finished
  zip/       each        entity   "3 gaps: 2 auto,        ONLY the     episode)
  uploads)   file?)      is it?)   1 needs you")          missing)
```

### 1. DUMP — bring everything, structured or not
Accept a **folder / zip / multi-file upload** containing any mix of:
- **Text**: script(s), series/season bible, production notes, shot lists
  (`.md`, `.txt`, `.pdf`, `.docx`).
- **Character art**: headshots, pose sheets, wardrobe sheets, expression sheets.
- **Locations / environments**: reference photos, keyframes.
- **Props / elements**: product/prop references.
- **Identity locks**: a list of existing **Higgsfield element IDs** (the trained
  identity models — the test proved these are the real fix for human likeness).
- **Optional**: existing clips / B-roll to reuse.

Two on-ramps, both supported:
- **Convention** (fast path): a known folder shape —
  `Characters/<Name>/headshot.*`, `Characters/<Name>/posesheet.*`,
  `Locations/<Name>/*`, `Props/<Name>/*`, `elements.json`, `script.md`,
  `bible.md`. If files follow it, classification is trivial and exact.
- **Unstructured** (smart path): just dump files in. The classifier (next) figures
  it out. A user never has to rename anything.

A tiny **optional `manifest.json`** can override/confirm anything (the escape hatch
for ambiguous cases) — but is never required.

### 2. CLASSIFY — what is each file?
- **Text files** → a classifier pass (Claude) tags each as `script` /
  `bible` / `production_notes` / `shotlist` / `other`, and which episode it belongs
  to.
- **Images** → a **vision** pass (Claude/Gemini): for each image return
  `{kind: headshot | pose_sheet | location | prop | storyboard | clip_frame | other,
  subject_guess: "a Black man, late 20s, dreadlocks", text_seen: "THE DRIFTWOOD"}`.
  Convention-named files skip this (filename is the label).
- **JSON/CSV** → element-ID maps, character lists, prior extraction.
- Output: a typed inventory of every file with a kind + a subject guess + confidence.

### 3. MAP — link assets to story entities
First run **extraction** on the script+bible (existing `/api/extract`, made reliable
— see "Reliability" below) to get the canonical entities: characters, scenes,
locations, `setting_profile`. Then **resolve** each classified asset to an entity:
- **Name match** first (filename or convention folder → entity name), case- and
  punctuation-insensitive (avoids the UPPERCASE/`KHALIL` brittleness we hit).
- **Vision match** for the rest: compare the asset's `subject_guess` to each
  character/location description and pick the best fit (e.g. a headshot of "older
  Afro-Caribbean man, long locs" → `Local Man`). Carry a confidence score.
- **Element IDs** attach to their named character/location.
- Anything **low-confidence** is surfaced for a one-click human confirm — never
  guessed silently.
- Output: a mapping `entity → {headshot?, pose_sheet?, references[], element_id?}`.

### 4. READINESS GAP REPORT — "do we have everything?" (the heart of it)
For every entity, compute present-vs-needed and render a single dashboard:

```
PROJECT READINESS — "We Bought a Bar" Ep1            ●  2 gaps before run-ready

CHARACTERS                desc  headshot  pose  element
  Khalil                   ✓      ✓ (yours)  ✓ (yours)  ✗  → auto: create element
  Nicole                   ✓      ✓ (yours)  ✓ (yours)  ✓ (5ab9…)   ready
  Local Man                ✓      ✓ (yours)  ✗          ✗  → auto: generate pose sheet

LOCATIONS                 desc  reference  element
  The Driftwood            ✓      ✓ (yours)   ✓ (5eeb…)   ready
  Beach Road               ✓      ✓ (yours)   ✗  → auto: derive element

SCENES                    scout  panels
  1–8                      ✓ (from loc)  ✗  → auto: storyboard

ELEMENTS / PROPS
  Driftwood sign           ✗  → auto: generate reference  OR  ⚠ needs your input?

SUMMARY: 6 gaps total — 6 the system will auto-generate, 0 need you.
         Everything you provided is LOCKED and will not be regenerated.
         [ Fill gaps & run ]   [ Review/adjust mapping ]   [ Add more assets ]
```

This is the "make sure we don't have gaps / don't need to create anything else"
answer: **before** spending a credit, you see exactly what's covered, what the
system will build, and what (if anything) it needs from you. No black box.

### 5. FILL GAPS, then RUN — generate only what's missing
- **Provided assets are locked**, never regenerated (the test run's core behavior:
  approved + locked headshots, approved location images, scene scouts attached).
- The orchestrator gets a **per-entity skip list** so its generate steps run **only**
  for gaps: a character with a headshot skips casting; a location with a reference
  skips scouting; only the truly-missing pieces (a pose sheet, an element, the
  storyboard, first frames) generate.
- Then it drives storyboard → first frames → clips → assemble → QA to a finished
  episode, exactly as the auto pipeline does today.

---

## HOW IT REUSES WHAT EXISTS
- **`scripts/seed-locked-assets.mjs`** is the prototype of stage 5's "attach
  provided assets as locks" — generalize it (no hardcoded paths, auto-match instead
  of static maps, built-in downscale).
- **`/api/extract` + `setting_profile`** is stage 3's extraction (worked great in
  the test — 2010 era + forbidden list).
- **The orchestrator** already skips entities that are already approved/locked — the
  skip-list is a light extension of that existing logic.
- **The Workspace/Hub (REVISION_VISION R4/R5)** is the natural home for the
  readiness dashboard + the asset browser + the "fill gaps & run" button.
- **The 3-axis gate** still runs on every *generated* gap (so auto-built pieces meet
  the realism/identity/beat bar); provided assets bypass the gate (they're your
  locks).

## RELIABILITY FIXES THIS FLOW DEPENDS ON (from the test run)
1. **Extraction must not 504** (the 60s cap). Intake should run extraction
   **server-side-async** (a job row + poll) or via a local worker, so a rich
   script+bible never dies on a single request. (Same fix the AUTH/infra notes
   call for.)
2. **Large images auto-downscale** on ingest (Khalil's 7.9MB headshot timed out a
   DB insert) — store big refs in Storage and keep DB rows to URLs/thumbnails, or
   downscale to ~1600px JPEG on intake.
3. **Matching must be fuzzy + vision-assisted**, not exact-string (the test needed
   UPPERCASE names and hand-aligned location strings).
4. **Shot density must scale to runtime** (the auto-breakdown made 117 panels for a
   90s episode) — intake should pass the target runtime so storyboard caps shots.

## BUILD PHASES
| Phase | Scope | Ships |
|---|---|---|
| **I1 — Generalized intake script** | A CLI: `node intake.mjs <folder> --project "<title>" --runtime 90`. Convention-folder + manifest support, name-match mapping, auto-downscale, extraction, attach-as-locks, **print the readiness report to the terminal**, `--fill-gaps --run` to execute. This is buildable now and replaces all the manual seeding. | One command turns an asset folder into a running episode |
| **I2 — Vision classify + fuzzy/vision match** | Add the image vision classifier + best-fit matching so unstructured dumps work and low-confidence items get flagged. | Drop files in any shape; it figures them out |
| **I3 — In-app readiness dashboard** | The gap report as a screen in the Hub: drag-drop upload, per-entity ✓/✗ grid, confirm low-confidence matches, "Fill gaps & run". | No terminal; a producer can do it |
| **I4 — Skip-list orchestration + runtime-aware storyboard** | Formalize the per-entity skip list in the orchestrator; pass target runtime to cap shot density. | Generates only gaps, at the right length |
| **I5 — Async extraction + Storage-backed refs** | Remove the 60s-cap dependency; big refs via Storage URLs. | Reliable on rich bibles + large art |

**Recommended start: I1.** It's the 80/20 — a single command that ingests a folder,
shows the readiness report, and runs, removing every manual step from the test run.
I2–I3 make it pretty and unstructured-tolerant; I4–I5 make it bulletproof.

## OPEN QUESTIONS
1. **Folder convention** — do you want to standardize one (so the fast path is
   exact), or lean fully on vision classification? (I'd do both: convention wins
   when present, vision fills the rest.)
2. **Gap policy default** — when something's missing, auto-generate by default, or
   always pause and ask? (Proposal: auto-generate the *obvious* gaps — pose sheet,
   element, storyboard, frames — and only pause for genuinely ambiguous ones, e.g.
   a character with no description AND no headshot.)
3. **Element creation** — creating a Higgsfield element from a provided headshot is
   the highest-value gap-fill (it's the identity fix). Should intake do that
   automatically for every provided character, or only on request? (It needs the
   Higgsfield connector/CLI, like clip fulfillment.)
4. **Multi-episode / series reuse** — characters and the Driftwood recur across all
   episodes. Should intake build a **series-level asset library** that every episode
   inherits, so you only ingest the cast once? (Strongly yes — this is the real
   long-term shape.)
