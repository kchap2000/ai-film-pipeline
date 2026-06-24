# Go-Live Runbook — Series Microdrama

Copy-paste steps to take the series layer live and run a real season through it.
Worked example uses **The Maiden Voyage** (Lazy Mon) — swap titles/paths for your season.

Repo root: `/Users/khalilchapman/Desktop/ai-film-pipeline`
Live URL: the Vercel production deploy (after merge). Supabase ref: `onavhfhpdxwzdwotkddq`.

---

## PHASE 0 — Deploy the code (one-time)

**1. Apply the series migration.** Open the Supabase SQL editor for project
`onavhfhpdxwzdwotkddq`, paste the entire contents of:
```
supabase/migrations/2026-06-23_series_library.sql
```
and run it. It's additive + idempotent — safe to re-run. (This is the one step the
agent is blocked from doing; everything degrades gracefully until it's applied.)

**2. Merge PR #37 → main.** https://github.com/kchap2000/ai-film-pipeline/pull/37
```bash
gh pr merge 37 --squash --delete-branch=false   # or merge via the GitHub UI
```
Vercel auto-deploys on merge to `main`.

**3. Verify.** After the deploy is READY:
```bash
curl -s https://<live-url>/api/series | head        # → {"series":[...],"migrated":true}
```
Open the live URL → the dashboard now shows a **New Series** button.

---

## PHASE 1 — Ingest the season (per episode)

Each episode is its own project, tied together by the series. From the repo root:

```bash
# EP01 — local extraction (no 60s cap) + lock your provided assets + attach to series
node scripts/intake.mjs \
  "/Users/khalilchapman/Documents/Claude/Projects/The Life of The Lazy Mon/The Maiden Voyage/Episode Packages/EP01_<name>" \
  --project "EP01 — <Title>" \
  --series  "The Maiden Voyage" \
  --episode 1 \
  --runtime 75 --aspect 9:16 \
  --manifest "<ep01-folder>/intake_manifest.json"     # optional: exact asset→entity map + live element ids
```
- First `--series "The Maiden Voyage"` **creates** the series; later episodes with the
  same title **attach** to it. (Or pass `--series-id <id>` once it exists.)
- A `--manifest` (the EP03 one is a template) gives a deterministic asset map and lets you
  supply **already-live Higgsfield element ids** so those assets are never re-created.
- intake prints a **READINESS report** and, if any character lacked a live element, writes
  `<ep-folder>/.intake-element-work.json` (elements staged for creation).

Repeat for EP02…EPN, incrementing `--episode`.

---

## PHASE 2 — Build each episode to finished video

> **Generation backend.** Creating Higgsfield **elements**, **element keyframes**, and
> **video clips** runs through the Higgsfield connector. Two modes:
> - **Headless:** add `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_SECRET` to `.env.local` →
>   `fulfill-frames.mjs` / `fulfill-clips.mjs` generate directly.
> - **Connector (today):** a Cowork session with the Higgsfield MCP fulfills the staged
>   work (this is what proved EP03). No REST creds needed.

Per episode (use its `<project-id>` from the intake output):

```bash
# 1) Storyboard locally (avoids the 60s storyboard 504), then drive cast→…→clips→assemble→qa
node scripts/worker.mjs <project-id> --only storyboard --drive

# 2) ELEMENT key frames for character shots (identity/wardrobe/set locked):
#    a. queue them (engine builds the <<<element_id>>> prompts)
curl -s -X POST https://<live-url>/api/projects/<project-id>/first-frames \
  -H "Content-Type: application/json" -d '{"action":"plan_elements"}'
#    b. emit the work manifest for the connector
node scripts/fulfill-frames.mjs <project-id>
#    c. (Cowork w/ Higgsfield MCP) generate each from the manifest prompt, collect
#       {frame_id,image_url} into results.json, then write them back:
node scripts/fulfill-frames.mjs <project-id> --apply results.json

# 3) Video clips (image-to-video off the approved frames) — connector or REST:
node scripts/fulfill-clips.mjs <project-id>            # then assemble + QA via the pipeline
```

Environment/establishing shots stay on Gemini automatically; only person-in-shot frames
route to elements.

---

## PHASE 3 — Watch, review, change

- **Watch:** live URL → series tile → **Open** the series → episode tiles show real
  completion + thumbnails → **Watch** opens the screening room (assembled film + clip
  playlist + QA score).
- **Per-episode feedback:** in the screening room, dictate/type a note → targeted regen →
  versioned v2 (REVISION VISION).
- **Series-wide change (recast / swapped asset):** on the series page, click **Propagate
  to all episodes** on the asset. It re-points every episode and **queues regen** of the
  affected shots — *non-destructively* (current frames stay watchable until the new ones
  land). Then re-run Phase 2 step 2–3 for the queued shots.

---

## Cheat sheet
| Need | Command |
|---|---|
| New series + ingest an episode | `node scripts/intake.mjs <folder> --series "<T>" --episode N --project "<P>"` |
| Storyboard without the 60s cap | `node scripts/worker.mjs <pid> --only storyboard --drive` |
| Queue element key frames | `POST /api/projects/<pid>/first-frames {"action":"plan_elements"}` |
| Fulfill key frames (connector) | `node scripts/fulfill-frames.mjs <pid>` → generate → `--apply results.json` |
| Fulfill clips | `node scripts/fulfill-clips.mjs <pid>` |
| See the season | live URL → series tile |
| Change once, update everywhere | series page → **Propagate to all episodes** |
