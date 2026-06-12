# REVISION VISION — Feedback Loop + Project Workspace

> **The Goal:** After the machine produces a film, a human (Khalil or a client) watches it,
> says what's wrong in plain language — typed or dictated — and the system regenerates ONLY
> the affected shots, re-stitches, and delivers a new version. Alongside that, every project
> gets one clean workspace where all characters, locations, scenes, elements, and film
> versions are visible and swappable, even when the project ran in Auto Mode.
>
> Read this after FINAL_VISION.md. This is the next major build. Status lives in PROGRESS.md.

---

## THE ONE BIG ARCHITECTURAL IDEA: A SHARED REVISION ENGINE

Both halves of this vision are the same machine underneath:

```
   Screening Room feedback ─┐
   ("the dragon looks fake") │
                             ├──► REVISION PLAN ──► REVISION RUN ──► new film version
   Asset Hub swap ──────────┘      (structured        (orchestrator
   ("recast the Soldier",           list of targets     executes ONLY
    "use location image #3")        + actions +         the plan steps)
                                    correction text)
```

A **Revision Plan** is a structured object: which panels/clips/characters/locations/elements
are affected, what action each needs (`reframe`, `reclip`, `recast`, `swap_image`,
`element_fix`, `edit_metadata`), and a correction addendum (the human's words, distilled)
that gets injected into the regen prompts — exactly the same mechanism the realism gate
already uses for its re-roll addendum.

A **Revision Run** is a `pipeline_runs` row with `run_type = 'revision'` that carries the
plan in its `progress` cursor and executes only the needed steps:
`(recast → pose → elements)? → first_frames(targets) → video_clips(targets) → assemble → stitch → qa(verify)`.
This reuses the existing resumable step machine — no new orchestrator.

**Why this matters:** we build the targeting/regen/re-stitch machinery once, and both the
feedback box and the workspace buttons feed it.

---

## WHAT ALREADY EXISTS (verified in code, don't rebuild)

| Capability | Where | Notes |
|---|---|---|
| Targeted clip regen | `POST /api/projects/:id/video-clips` | `panel_id` + `replace: true` + `no_group` + `motion_prompt` override all work today |
| Clip lineage | `video_clips.parent_clip_id`, `covered_panel_ids` | Sequence clips group ≤3 panels; replace demotes covering clip |
| Frame replace w/ history | `first_frames.parent_frame_id`, status `replaced` | Regen keeps old rows |
| QA → regen targets → loop | `qa/route.ts` + `auto-pipeline/route.ts` case `"qa"` | `regen_targets[]` → first_frames → video_clips → assemble → qa, ≤3 loops |
| Correction addendum pattern | `realism-gate.ts` + orchestrator re-roll | Scored issues become prompt addendum — reuse for human feedback |
| Director agent w/ 10 tools | `agent/route.ts`, `DirectorChat.tsx` | update_character/location/scene/panel/notes + 5 regen tools incl. `regenerate_video_clip` |
| Assembly picks best clip/panel | `assembly/route.ts` | Re-running assembly after one clip regen naturally reuses all unchanged clips |
| Stitch | `scripts/stitch-film.mjs` (ffmpeg-static) | Re-encodes to 50MB cap, cleans temp; full-manifest restitch is cheap |
| CLI fulfillment | `scripts/fulfill-clips.mjs` | Waves of 4, content-block ladder, `--finish` chains assemble+stitch |
| Provenance/staleness | `provenance.ts`, `staleness/route.ts` | Version cols on projects/characters/locations/scenes/panels; report is read-only today |
| Feedback/rules tables | `project_feedback`, `project_continuity_rules`, brain routes | Exist with light usage; reuse, don't recreate |
| Lessons | `lessons.ts`, `pipeline_lessons` | QA flags already become durable lessons; human feedback should too |
| Image lazy-load pattern | all phase pages + `/image` endpoints | Reuse for the hub; never bulk-select image columns |
| Elements registry | `elements/route.ts`, `project_elements` | derive/generate_image/PATCH exist; **no UI**; v2 elements use versioned bucket paths |

## THE REAL GAPS

1. **No feedback input anywhere post-render.** Screening Room shows the QA report but has no
   way for a human to say anything.
2. **No dictation.** DirectorChat and everything else is type-only.
3. **No feedback → target resolution.** "The last scene's dragon looks fake" must become
   `{panels: [31..36], element: abyssal-dragon, action: reclip, correction: "..."}`.
4. **No human-triggered revision run.** Only the QA-score loop regenerates; a human can't say
   "fix these three things and give me v2."
5. **No film versioning.** `assembled_videos` rows pile up by `created_at` — no version
   numbers, labels, parent links, or changelog.
6. **No unified workspace.** Assets are spread across 8 phase pages; locks are one-way
   (no unlock/recast); approved location/scene images can't be swapped; elements have no UI.
7. **Staleness is informational only.** No "this swap makes 12 frames + 4 clips stale →
   regenerate them" action.

---

## DATA MODEL CHANGES (one migration, Sprint R1)

```sql
-- 1. Film versioning
ALTER TABLE assembled_videos
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS label text,                         -- 'v1', 'Client Cut', ...
  ADD COLUMN IF NOT EXISTS parent_assembly_id uuid REFERENCES assembled_videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_id uuid,                   -- FK to revisions row that produced it
  ADD COLUMN IF NOT EXISTS changelog jsonb;                    -- [{panel_id, action, reason}]

-- 2. Revisions (the plan + its lifecycle). Reuses project_feedback for raw notes.
CREATE TABLE IF NOT EXISTS revisions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_assembly_id uuid REFERENCES assembled_videos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',  -- draft → planned → approved → running → done | failed | cancelled
  raw_feedback jsonb NOT NULL,           -- [{text, clip_id?, panel_id?, scene_number?, timestamp_s?, via: 'typed'|'dictated'|'hub_action'}]
  plan jsonb,                            -- resolved RevisionPlan (targets + actions + correction addenda)
  result_assembly_id uuid REFERENCES assembled_videos(id) ON DELETE SET NULL,
  pipeline_run_id uuid,                  -- the revision run executing it
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revisions_project ON revisions(project_id);

-- 3. Run type on pipeline_runs
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS run_type text NOT NULL DEFAULT 'full'; -- 'full' | 'revision'

-- 4. Element versioning (lightweight — variants as rows)
ALTER TABLE project_elements
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_element_id uuid REFERENCES project_elements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;  -- one active version per (kind,name)
```

**RevisionPlan shape (TypeScript, `src/lib/revision.ts`):**
```typescript
interface RevisionTarget {
  action: "reframe" | "reclip" | "reframe_and_reclip" | "recast" | "swap_location_image"
        | "swap_scene_image" | "element_fix" | "edit_panel" | "edit_character" | "edit_scene";
  panel_ids?: string[];          // resolved shot targets
  scene_id?: string;             // "the whole last scene"
  character_id?: string;         // recast / element_fix subject
  location_id?: string;
  element_id?: string;
  variation_id?: string;         // for swaps: which existing variation to promote
  correction: string;            // distilled human note, injected as prompt addendum
  motion_override?: string;      // optional custom motion prompt for reclip
}
interface RevisionPlan {
  targets: RevisionTarget[];
  summary: string;               // human-readable "what I'm going to do"
  estimated_units: { frames: number; clips: number };  // cost/effort preview
  lessons: string[];             // durable lessons to record (project or global scope)
}
```

---

## PILLAR A — THE FEEDBACK & ITERATION LOOP

### A1. Capture: Director's Notes in the Screening Room
`src/app/projects/[id]/video/watch/page.tsx` gains a **Notes rail**:

- Persistent note input below the player. The player already knows the current manifest
  entry → every note auto-attaches `{clip_id, panel_id, scene_number, timestamp_s}`.
  Human types "dragon looks fake here" while watching — no need to say which scene.
- **"Flag this shot"** button: pauses, captures current clip context, opens note input.
- **Dictation:** new shared hook `src/lib/use-dictation.ts` wrapping the Web Speech API
  (`webkitSpeechRecognition`, continuous + interim results). Mic button on the notes input
  AND on DirectorChat's input (free win). No backend needed; transcription is client-side.
- Notes accumulate in a draft list (edit/delete) → one **"Submit notes & build revision"**
  button. Multiple notes go in as a single revision so one re-stitch covers everything.
- API: `POST /api/projects/:id/revisions` `{ raw_feedback: [...] }` → creates `revisions`
  row (status `draft`), immediately invokes the resolver (below), returns the plan.

### A2. Resolve: feedback → RevisionPlan
New `POST /api/projects/:id/revisions/:rid/plan` (also called inline on create).
Claude Sonnet with full project context (same context assembly the agent route already
builds: characters, locations, scenes, panels + clip coverage + element registry) resolves
each note into `RevisionTarget`s:

- "Last scene, dragon in the air looks too fake" → panels of the final scene where the
  Abyssal Dragon element appears → `reframe_and_reclip` with correction addendum
  "the dragon must read photoreal: bone-membrane wings, weight, atmospheric scale…"
  (pulls phrasing through the prompt engine / lessons, not raw user text).
- Notes with attached `panel_id`/`clip_id` context skip inference — they're already targeted.
- Resolver decides the cheapest sufficient action: motion/clip problem → `reclip` only;
  composition/content problem → `reframe_and_reclip`; identity problem → `recast` (full
  chain: re-cast under setting profile → pose gate → element v2 → reframe → reclip, exactly
  the PR #30 reference-refresh flow, now automated).
- Sequence-clip awareness: if a target panel is inside a `covered_panel_ids` group, the plan
  expands to the whole group with `replace: true` (or `no_group` single-shot when the note is
  about one beat).
- Output also includes `lessons[]` — human notes become durable `pipeline_lessons` via the
  existing `recordLesson()`, so the same mistake doesn't recur in future projects.

### A3. Confirm: show the plan before burning credits
The Notes rail renders the returned plan: "I'll regenerate 6 frames and 4 clips across
Scene 3, recast nothing. Estimated ~80 credits." Buttons: **Run revision** (status →
`approved`, kicks the run) / **Edit notes** / **Discard**. In Auto Mode projects this
confirm step is the ONLY human gate — that's the point.

### A4. Execute: the revision run
`POST /api/projects/:id/auto-pipeline` gains `{ run_type: 'revision', revision_id }`:

- Seeds `progress` with the plan's targets (the QA loop already proves this cursor pattern
  with `regen_panel_ids` / `regen_clip_panel_ids` — extend, don't fork).
- Step order, skipping anything not in the plan:
  1. `revision_edits` — apply metadata edits / swaps / unlocks (bump versions, provenance)
  2. `recast` targets → cast gen + auto-select + pose + element v2 (reuses existing steps)
  3. `first_frames` for target panels — **correction addendum appended to the prompt**, runs
     through the realism gate (and the upcoming two-axis gate) as usual
  4. `video_clips` for target panels with `replace: true` + addendum/motion override
  5. `assemble` → new `assembled_videos` row: `version = parent.version + 1`,
     `parent_assembly_id`, `revision_id`, `changelog` built from the plan
  6. `stitch` — full-manifest restitch (unchanged clips are reused by the best-clip-per-panel
     logic; ffmpeg re-concat is cheap). Local path: `fulfill-clips.mjs --finish` already does
     this; add `--revision <id>` so it fulfills only that run's pending clips.
  7. `qa` in **verify mode**: score only changed scenes against the notes ("did the fix land"),
     write result onto the revision row. No auto-loop — the human is the loop now.
- Fulfillment reality: with no Higgsfield REST creds in prod, clips park `pending` and the
  CLI runner finishes them — same as today. With creds, it's fully hands-off.

### A5. Versions in the Screening Room
- Version dropdown (v1, v2 "fixed dragon", …) sourced from the `parent_assembly_id` chain;
  changelog shown per version; "compare" = side-by-side players seeked to the changed scene.
- Keep all versions; add "mark as final" label.

---

## PILLAR B — THE PROJECT WORKSPACE (ASSET HUB)

One page: `src/app/projects/[id]/hub/page.tsx`, linked first in ProjectNav. Tabs:

### B1. Cast tab
- Card per character: current approved headshot (lazy-loaded), pose sheet, role, version,
  locked badge, element status (v1/v2, `element_ready`), gate scores.
- Expand → ALL cast variations ever generated (approved/pending/rejected/superseded).
- Actions: **Recast** (pick a different variation OR generate fresh OR upload) — works on
  LOCKED characters: new `PATCH /api/projects/:id/lock` `{character_id, unlock: true}` →
  re-approve → relock, version bump, provenance marks downstream stale. **Regenerate pose
  sheet. Create element v2 from new ref** (PR #30 flow). Every action ends with the
  **staleness banner** (B5).

### B2. Locations & Scenes tabs
- Card per location/scene: approved image + all variations.
- **Swap approved image** without regenerating: `PATCH` with
  `{location_id, variation_id, swap_approved: true}` (today approve auto-rejects siblings —
  stop rejecting, keep them swappable; new status `superseded` instead of `rejected`).
- Generate more variations; upload custom.

### B3. Elements tab (first-ever UI for the registry)
- Grid by kind (character/prop/outfit/environment): ref image, status, Higgsfield element id,
  version chain, which scenes use it.
- Actions: regenerate ref image (gated), create new version, set active version, derive
  missing elements from script.

### B4. Films tab
- All assembled versions with changelog, QA scores, stitched-file download, "open in
  Screening Room", revision history (who asked for what, when).

### B5. The staleness banner → cascade regen (this is where Auto Mode stays auto)
After any hub action: call the existing staleness report, render
"This change affects: 12 first frames, 4 clips, 1 element across Scenes 2–3.
**[Regenerate affected & build v3]** [Later]".
The button creates a `revisions` row with `via: 'hub_action'` and a pre-resolved plan —
**same engine as Pillar A**. "Later" leaves the staleness badge visible on the hub + project
page (report endpoint already exists; today it's only informational).

---

## SPRINT PLAN

| Sprint | Scope | Ships |
|---|---|---|
| **R1 — Foundations** | Migration above; `src/lib/revision.ts` types + plan validator; `run_type` on pipeline_runs; assembly route stamps version/parent/changelog; stop auto-rejecting sibling variations (→ `superseded`) | Schema + types, no UI change visible |
| **R2 — Feedback capture + resolver** | Screening Room Notes rail (clip-context capture, flag-this-shot, draft list); `use-dictation.ts` hook (+ mic on DirectorChat); `POST /revisions` + resolver endpoint; plan-confirm UI with cost preview | You can watch, dictate notes, and see the machine's revision plan |
| **R3 — Revision runs** | Orchestrator `run_type: 'revision'` path (revision_edits → frames → clips → assemble → qa-verify); fulfill-clips `--revision`; version dropdown + changelog in Screening Room; feedback → `recordLesson()` | Full loop: notes in → v2 film out with one CLI command (or zero with REST creds) |
| **R4 — Hub MVP (read)** | `/hub` page, all five tabs read-only, lazy-loaded via existing `/image` endpoints + one new slim `GET /api/projects/:id/hub` summary route; ProjectNav link | See everything in one place, including Auto Mode projects |
| **R5 — Hub actions** | Unlock/recast flow; swap approved location/scene image; element version management UI; staleness banner + "Regenerate affected" feeding the revision engine | Recast/swap anything post-auto-run, cascade handled |
| **R6 — Polish** | Version compare view; revision history timeline; client share of Screening Room w/ notes-only permissions (pairs with the pre-launch auth task); QA verify-mode tuning | Client-ready review loop |

**Order rationale:** R1–R3 close the loop Khalil described first (feedback → targeted regen →
re-stitch → new version) because it's the highest-leverage missing piece and the hub's action
buttons (R5) need the same engine anyway. R4 is deliberately read-only so it can ship fast.

### Effort sense (relative)
- R1 small. R2 medium (resolver prompt quality is the real work; dictation is ~50 lines).
- R3 medium — mostly wiring existing steps; the QA loop is the template.
- R4 medium (one page, six fetches, reuse lazy-load pattern). R5 large-ish (unlock semantics
  + cascade correctness). R6 flexible.

### Risks / open questions
1. **Resolver precision** — "the last scene" is easy; "the part where he hesitates" needs
   beat-level matching. Mitigation: clip-context auto-attach makes most notes pre-targeted;
   verify-QA catches misses.
2. **Sequence clips** — replacing one panel inside a 3-panel Seedance sequence regenerates
   the group; plan must surface that ("this fix re-renders 3 shots") so cost isn't a surprise.
3. **Recast cascade cost** — a recast invalidates every frame the character appears in. The
   plan's `estimated_units` + confirm gate is the control. Optionally cap to flagged scenes.
4. **Dictation support** — Web Speech API is Chrome/Safari-only-ish; fine for now (Khalil +
   clients on desktop Chrome). Server-side Whisper is a later upgrade if needed.
5. **Stitch in prod** — single-file restitch still needs the local CLI (or future cloud
   assembler); manifest playback in the Screening Room works immediately after assemble, so
   v2 is watchable before it's stitched.
