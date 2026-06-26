# 🧠 PROJECT BRAIN — AI Film Pipeline (read this first)

**The single catch-up file.** Any agent: read this top-to-bottom to understand the project,
its current state, how it works, and what's next — then dive into the linked docs only for
detail. Keep this file CURRENT (update the "Current state" + "Next" sections when they change).

_Last updated: 2026-06-24._

---

## 1. What this is
A web app (Next.js 14 + Supabase + Vercel) that turns a **script + pre-built assets** into a
finished **vertical AI microdrama** — and now houses a whole **series** of episodes. Pipeline:
`extract → cast → pose → locations → scenes → storyboard → elements → first_frames → video_clips → assemble → QA`,
driven by a resumable step-machine orchestrator. Claude does extraction/shot-breakdown/scoring;
**Gemini** generates environment images; **Higgsfield** (trained "Elements" + Seedance) handles
identity-locked frames and video.

- **Live URL:** Vercel prod (auto-deploys on push to `main`). **Supabase ref:** `onavhfhpdxwzdwotkddq`.
- **Brain protocol:** the cross-project source of truth is `/Users/khalilchapman/Desktop/brain.json`
  (key `ai_film_pipeline`). Read it at task start; update it at task end.

## 2. Current state (2026-06-24)
- **All work is on branch `feature/asset-intake` → PR #37** (NOT yet merged to `main`, so NOT
  on the live URL yet). https://github.com/kchap2000/ai-film-pipeline/pull/37
- **Series migration: APPLIED** to Supabase (`20260624153250 series_library`). So the series
  layer will work the moment the PR merges + deploys.
- **Verified working:** the element-keyframe connector seam (proven live on EP03's failed shots),
  graceful degradation (app unaffected pre-migration), full `npm run build`, agent review of the
  series layer (4 bugs found + fixed + re-verified).
- **PR #37 title/body are updated** to the true scope:
  `Asset Intake + Element Connector Seam + No-Pro Worker + Series Layer`.

## 3. The ONE architectural truth to understand
There are effectively **two pipelines** and the whole design hinges on connecting them:
- **The deployed Vercel code** is element-aware and well-built, but **can't reach Higgsfield**
  (no REST creds in prod) and historically hit a **60s function cap**.
- **The Higgsfield connector** lives in a **Cowork/MCP session** (an agent like you), or via REST
  creds if added.
The **seam** between them is the key rail: the app builds element-tagged prompts + pending rows;
a connector runner (`scripts/fulfill-frames.mjs` / `fulfill-clips.mjs`) or a Cowork agent
generates them and writes results back. **Routing rule:** person-in-shot → Higgsfield Element
(identity/wardrobe/set locked via `<<<element_id>>>`); environment/establishing → Gemini (9–10/10).
Full detail: `ELEMENTS_VS_GEMINI.md`, `PIPELINE_REVIEW.md`.

## 4. What's built (this era of work)
- **Track A — connector seam:** `first-frames` routes character shots through trained elements
  (`src/lib/element-keyframes.ts`, `planElementKeyframes`, PATCH fulfillment, `scripts/fulfill-frames.mjs`).
- **Track B — no-Vercel-Pro worker:** `scripts/worker.mjs` runs extraction + storyboard LOCALLY
  (beats the 60s cap), then the orchestrator resumes at `cast_generate`.
- **Track C — series asset library + intake auto-elements:** `scripts/intake.mjs` (`--series/--episode`,
  single-face crop, auto-element rows).
- **Series layer:** series container + episode dashboard (thumbnails, TRUE ingest→QA completion,
  Watch) + cross-episode **non-destructive propagation** ("change once, update everywhere").
  Code: `src/app/api/series/**`, `src/app/series/[id]/`, `src/lib/{episode-status,series-propagation,series-util}.ts`.

## 5. Next actions (the gates)
1. **Merge PR #37 → main** (only Khalil can; auto-deploys to Vercel). Migration is already applied.
2. (Optional infra) Higgsfield REST creds → headless `fulfill-frames/clips`; Vercel Pro is NOT needed (worker.mjs covers the cap).
- To run a season once live: **`GO_LIVE_RUNBOOK.md`** (copy-paste: ingest → build → watch → propagate).

## 6. Rules an agent MUST NOT break (from CLAUDE.md)
- **No base64 image columns in bulk GET** — lazy-load via the dedicated `/image` endpoints.
- **Never `.eq("user_id", ...)`** — auth is a stub; `projects` has no `user_id`.
- **`export const dynamic="force-dynamic"` + `maxDuration=300`** on routes.
- **The sandbox can't push** (git index.lock) and **can't apply prod migrations / self-merge** — those are Khalil's.
- New element/identity code must keep the routing rule above; new series code must degrade gracefully if the migration is absent.

## 7. Key IDs & asset roots
- **EP03 test project:** `5c27dd18-2ac7-475b-8097-4d6b42263c5b` (the proven-good reference run).
- **Higgsfield workspace:** "Lazy Motion Labs". EP03 element ids (Khalil `207a7bd2`, Rocky `03749daa`,
  Fletch `75673877`, Cafe `124392ce`, Bathroom `988e76be`, apartment `8774e28b`, Trooper `30f8d718`,
  WorkUniform `2d99a437`).
- **Real asset root:** `/Users/khalilchapman/Documents/Claude/Projects/The Life of The Lazy Mon`
  (Maiden Voyage episodes under `The Maiden Voyage/Episode Packages/`).
- **Proven frames:** `~/Desktop/EP03_ElementTest/`, `~/Desktop/EP03_WiredTest/`.

## 8. Doc index (where the detail lives)
| Topic | File |
|---|---|
| Pipeline state + gaps + the two-pipeline truth | `PIPELINE_REVIEW.md` |
| Elements-vs-Gemini recipe + routing | `ELEMENTS_VS_GEMINI.md` |
| Series layer design | `SERIES_LAYER_PLAN.md` |
| Run a season (copy-paste) | `GO_LIVE_RUNBOOK.md` |
| Asset intake plan | `ASSET_INTAKE_PLAN.md` |
| Feedback/revision loop | `REVISION_VISION.md` |
| Director chat agent | `DIRECTOR_CHAT_V2.md` |
| Prompt engines | `PROMPTING.md`, `REALISM_NOTES_v5.md` |
| Auth/RLS pre-launch (held) | `AUTH_RLS_PRELAUNCH.md` |
| Full build history | `PROGRESS.md` (long) · operating rules: `CLAUDE.md` |
