# Production Crew — Specialized Agents

Specialized subagents that run the AI film pipeline as a production crew. Each owns one craft and
**orchestrates the existing routes/scripts/connector** — they don't reinvent them. All read
`_PRODUCTION_PROTOCOL.md` first (the shared contract: pipeline map, lock-layer rules, state discipline,
gotchas).

> Custom agents load at **session start**. After adding/editing one, start a fresh session for the
> `subagent_type` to be available to the Agent tool. (Verified working via smoke test 2026-06-26.)

## The crew (pipeline order)
| Agent | Owns | Wraps |
|---|---|---|
| `showrunner` | Orchestration — drives an episode end-to-end with gates + human checkpoints | the Agent tool |
| `segmenter` | True episode boundaries | `segment-episodes.mjs` |
| `avps-writer` | Thin script → AVPS (locks every detail; carries continuity state) | bible + DB |
| `art-dept` | Trained elements (faces, wardrobe, props, sets) | connector + `sync-registry.mjs` |
| `continuity-supervisor` | **The spine** — gates every generation, blocks drift, repairs dead ids | sync + segment + connector |
| `storyboard-dp` | **SEAM** — hand-off to Khalil's external GPT-image storyboard app | `/storyboard` (fallback) |
| `keyframe-gen` | Element-locked stills | `/first-frames` + connector + `fulfill-frames.mjs` |
| `editor-animator` | Multi-shot clips + frame-chaining | `/video-clips` + connector |
| `assembly` | Stitch the episode cut | local ffmpeg |
| `qa-supervisor` | Score vs AVPS, bank lessons, route regens | `/qa` + `pipeline_lessons` |

## The two rules that make it work (not the parallelism)
1. **One validated shared state** — `brain.json` + the pipeline DB + the bible/registry. Every agent
   reads state at start, writes validated state at end. The drift bugs were all state problems.
2. **The continuity-supervisor gates everything** — no keyframe/clip generation proceeds past a
   `GATE: FAIL`. Build the spine first or the rest just drifts faster.

## Human checkpoints (hard stops)
- After **avps-writer** → writers review the AVPS.
- After **keyframe-gen** → Khalil approves the stills before clips.

## Run an episode
Spawn `showrunner` with a target `episode_number`; it sequences the crew, enforces the gates, and
pauses at the two checkpoints.
