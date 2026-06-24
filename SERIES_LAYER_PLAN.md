# Series Layer — Detailed Build Plan (2026-06-23)

> Goal: turn the one-episode engine into a **series container** — drop a whole season
> in, house it as one project, see every episode lined up with thumbnails + true
> completion, watch them one at a time, and propagate changes (recast, asset edits,
> notes) across every episode. Built autonomously; verified with review agents.

## What exists (don't rebuild)
- Per-episode engine: intake → cast/locations/scenes → storyboard → element keyframes
  (Track A) → clips → assemble → QA. Solid.
- Per-episode screening room `/projects/[id]/video/watch`: assembled film + sequential
  clip playlist + QA report + versions. Reuse as the per-episode watcher.
- REVISION VISION: per-episode watch → note → targeted regen → v2.
- Series asset library data model: `supabase/migrations/2026-06-23_series_library.sql`
  (series, projects.series_id/episode_number, dual-scope project_elements,
  characters/locations.series_element_id) + series inheritance in the shared registry.

## The gaps this plan closes
1. **No series container / data model applied.** → apply migration; add Series CRUD.
2. **"Complete" is wrong** (card says complete at first-frames). → real episode status:
   ingested → cast → storyboard → first_frames → clips → assembled → qa → complete.
3. **No series dashboard.** → top-level series view: episode tiles w/ thumbnail +
   completion + QA score + Watch.
4. **No cross-episode propagation.** → recast/asset edit re-points every episode + flags
   affected frames stale (extend REVISION cascade to series scope).
5. **Ingest is per-episode only.** → intake can create/attach a series and ingest each
   episode under it, building the shared asset library once.

## Build phases (each ends with `npm run build` green)

### P0 — Foundation
- Apply `2026-06-23_series_library.sql` to Supabase `onavhfhpdxwzdwotkddq` (additive,
  non-breaking; verify with list_tables before/after).
- Types: `Series`, `EpisodeStatus`, extend `Project` (series_id, episode_number).

### P1 — Episode completion (the truth layer)  → `src/lib/episode-status.ts`
- `computeEpisodeStatus(project, counts)` → `{ stage, pct, label, qaScore, watchable,
  thumbnailFrameId }` from real signals: storyboard_panels, approved first_frames,
  completed video_clips, assembled_videos (status ready), qa_reports (overall_score).
- `watchable` = an assembled_videos row exists (scope full, manifest non-empty).
- Reused by the project card AND the series dashboard (one definition of "complete").

### P2 — Series API  → `src/app/api/series/**`
- `GET /api/series` — list series + episode rollup (counts, no base64).
- `POST /api/series` — create `{title, bible_text?, setting_profile?}`.
- `GET /api/series/[id]` — detail: ordered episodes each with computeEpisodeStatus +
  thumbnail URL + watch link; series asset-library summary.
- `PATCH /api/series/[id]` — attach/detach a project (`series_id`, `episode_number`),
  reorder, edit bible.
- `POST /api/series/[id]/promote-element` — lift a proven project element to series scope
  (reuse higgsfield_element_id; flips project rows to inherit).

### P3 — Series dashboard UI
- Dashboard (`/`) groups projects by series (series cards) + ungrouped projects.
- `/series/[id]` page: header (title, progress rollup "3/8 episodes complete"), **episode
  tiles** — thumbnail (assembled poster → else approved first frame via existing /image
  endpoints), status chip + pct bar, QA score, **Watch** (→ `/projects/[id]/video/watch`),
  Open (→ project hub), and a "+ Add episode" (intake or attach).
- `EpisodeTile` + `SeriesCard` components. Lazy-load thumbnails (no base64 in bulk).

### P4 — Cross-episode propagation  → `src/lib/series-propagation.ts` + API
- `POST /api/series/[id]/propagate` `{kind:"recast"|"element", ...}`: re-point every
  episode's character/location row to the new series element id; flag affected
  first_frames/clips stale (status → "replaced" or a `stale` marker) so the existing
  per-episode REVISION/regen picks them up. Report which episodes/panels changed.
- Surfaced on the series page ("Khalil recast → 4 episodes, 23 shots flagged for regen").

### P5 — Series ingest  → `scripts/intake.mjs`
- `--series "<title>"` / `--series-id <id>` + `--episode <n>`: create/attach series, set
  projects.series_id/episode_number, build series elements ONCE (promote on first
  episode), later episodes inherit (skip re-create). Reuses Track C auto-elements.

### P6 — Verify (agents)
- Build green. Local dev-server smoke: create a series, attach EP03 + the WBAB project,
  load `/series/[id]`, confirm tiles + status + watch link.
- Adversarial review agents over: (a) data-model + migration safety, (b) API correctness +
  no base64 in bulk, (c) status/“complete” correctness, (d) propagation correctness +
  idempotency, (e) UI integration. Fix findings.

## Hard constraints honored
- No base64 in bulk GET (CLAUDE.md) — thumbnails via existing /image endpoints.
- Never filter by user_id (auth stub) — series.user_id nullable, no eq(user_id).
- maxDuration=300 + dynamic="force-dynamic" on new routes.
- Migration apply + git push are the only steps that may need Khalil (attempt migration
  via MCP; report if blocked).
