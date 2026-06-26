# AI Film Pipeline — State of the Pipeline Review (2026-06-23)

> Written after the EP03 "Running Late" element test exposed a systemic gap, not a
> one-off render glitch. Grounded in the current code, not memory.

## TL;DR
The architecture is good and ~80% built. The failures come from **integration, not
design**: the element-tagging system that prevents identity/wardrobe/set drift is either
**unwired (keyframes)** or **unexecutable (video, no creds)**, so real runs fall back to
hand-rolled generations that drop all the locks. Fixing the **connector seam** is the
single highest-leverage move.

---

## 1. Where the pipeline IS (grounded in code)

**Orchestrator** (`auto-pipeline/route.ts`) — a 14-step machine with a QA loop:
extract → cast_generate → cast_select → pose_sheets → locations_generate →
locations_select → scenes_generate → scenes_select → storyboard → **elements** →
**first_frames** → **video_clips** → assemble → **qa** (QA_PASS_SCORE=80, MAX_QA_LOOPS=3).
Plus a `revision_edits` step (Revision Vision R1–R6) for targeted regen.

**Element system** (well-designed, in `prompt-engine.ts` + schema):
- `project_elements` registry: kinds = character / prop / **outfit** / environment, each
  with `match_terms` + `higgsfield_element_id` + status (planned→image_ready→element_ready).
- `applyElementPlaceholders` swaps match-terms in shot text → `<<<element_id>>>`.
- `rankAndCapElements` caps active refs at **4** (Higgsfield's practical limit), ranks
  in-shot characters > other chars > props > outfits > extra envs, reserves a slot for the
  location element.
- `buildShotPrompt` emits the house structure: preamble + production directive → VISUALS
  (with cast note + set note) → DIALOGUE → CONTINUITY RULES ("same outfit/set, no wardrobe
  change") → stability suffix.
- Reference **plates** for props/outfits are generated in the `elements` step (with a
  realism gate) before first frames.

**Quality gates:** 3-axis first-frame gate (realism ≥8 + beat fidelity + identity ≥7 vs
locked headshot), anachronism/wardrobe screening, `recordWin()` learning loop.

**Model routing** (`generate-video.ts`): characters → seedance_2_0, wide/establishing →
cinematic_studio_3_0, else kling3_0; content-block fallback chain (model → model →
text-only).

**Shipped product surfaces:** Revision Vision feedback loop, /hub Workspace + Readiness
tab, Director's Chat v2 (propose-then-execute), intake.mjs (folder → locked assets →
readiness → run), QA beat-analysis scorer.

---

## 2. The gaps (root causes of the problems we keep hitting)

**GAP 1 — The connector seam (THE big one).**
- The element-aware **keyframe** builder (`build-higgsfield-prompt.ts`) is **not called by
  any route.** The deployed `first-frames` step is **Gemini-only and element-blind.** →
  This is why identity fails on stills (Rocky grid, etc.).
- The element-aware **video** builder (`prompt-engine.ts`) IS wired into `video-clips`, but
  `generate-video.ts` returns `pending_external` because **there are no Higgsfield creds**
  in the environment. Clips never auto-generate; they park "pending" for a manual session.
- Net: the tagging system you expected has **never executed end-to-end.** Real output comes
  from hand-rolled MCP calls that bypass the engine (exactly what produced EP03's drift).

**GAP 2 — The 60s function cap.** The deployment doesn't honor `maxDuration=300`;
extraction AND storyboard 504 at 60s. The pipeline often can't get through its own opening
steps in prod (we sidestep via local `intake.mjs` extraction).

**GAP 3 — No series-level asset library.** Elements are per-project. Recurring cast (Khalil,
the Driftwood) and locations get **re-created every episode** — we just did 8 by hand for
EP03. Intake doesn't yet auto-create an Element (incl. a wardrobe/outfit element) from a
provided headshot (ASSET_INTAKE_PLAN open Q3).

**GAP 4 — Wardrobe is supported but not enforced.** "outfit" is a first-class element kind,
but nothing guarantees a work-uniform element gets created and tagged — so wardrobe drifts
("MV Landscaping," shirt vanishing) when it isn't locked.

**GAP 5 — QA never runs end-to-end.** The QA loop is built (score /100 vs screenplay) but
only fires if the pipeline completes — which it hasn't in prod. So we eyeball quality
instead of scoring it.

**GAP 6 — Security/launch debt (parked).** RLS disabled on all tables, anon key full access,
auth stub. Held until you say go (AUTH_RLS_PRELAUNCH.md).

---

## 3. The path to where it needs to be (priority order)

**TRACK A — Close the connector seam. (Highest leverage; fixes the quality problem.)**
Make the Higgsfield connector the official generation backend for **both** keyframes and
clips, driven by the **engineered prompts**, with an automated handoff:
1. Wire `build-higgsfield-prompt.ts` into the `first-frames` route so character shots
   render via Higgsfield **elements** (the code already decides route-to-Higgsfield);
   environment-only shots stay Gemini.
2. Build the **connector runner** the code already anticipates: a `fulfill-frames.mjs` +
   the existing `fulfill-clips.mjs` that read the pipeline's **element-tagged prompts** from
   the DB and execute them through the MCP/Higgsfield, PATCHing results back. This is the
   rail `generate-video.ts` is explicitly written for ("clip stays pending carrying the full
   motion prompt … a Cowork session generates it and PATCHes video_url back").
3. Result: every run uses element tagging + wardrobe/set locks + rank-and-cap +
   continuity + the 3-axis gate — **automatically. No hand-rolling.**

**TRACK B — Unblock the function cap.** Vercel Pro (so `maxDuration=300` is honored) OR
formalize async job rows + a local/connector worker for extraction + storyboard (generalize
what intake.mjs already does locally).

**TRACK C — Series-level asset library + intake auto-elements.** Promote elements to
**series scope** (cast + locations created once, inherited per episode). Intake auto-creates
an Element — including a **wardrobe/outfit** element — from every provided headshot, with a
single-face auto-crop (multi-pose sheets degrade elements). Kills the per-episode
re-creation we did by hand.

---

## 4. Multiple outcomes per project (parameterize, don't hardcode)

Different projects need different shapes. Introduce a **project profile** (extends the
existing `production_notes`/`setting_profile`) carrying: aspect ratio, grade/era,
identity-criticality, dialogue/lip-sync on/off, and **target deliverable tier**.

**Deliverable tiers (exit points):**
- **T1 — Keyframe book:** element-locked stills only. Fast, cheap, great for pitch/approval.
- **T2 — Animatic:** keyframes + short motion previews, no full QA.
- **T3 — Finished episode:** clips + assembled cut + QA /100 + revision loop.

**Archetype defaults:**
| Project | Ratio | Identity bar | Notes |
|---|---|---|---|
| Maiden Voyage microdrama | 9:16 | real-person lock (Khalil), dialogue/lip-sync | episodic; needs the series library most |
| LOLM S1 (Driftwood/Costa Rica) | 2.39:1 | live-action realism, location continuity | `build-higgsfield-prompt` LOLM style line already targets this |
| Apex Hunter | 16:9 | creature/prop locks > real-person | action sequences, VFX grade |
| Marketing / shorts | varies | speed over perfection | T1/T2, 1–3 shots |

A project picks a profile → the orchestrator routes models, ratios, grade, and **stops at
the chosen tier** instead of forcing every project to a full episode.

---

## 5. Honest status line
The design is sound and mostly built. The reason output is bad is that **runs don't use the
design** — the element engine is unwired on keyframes and unexecutable on video, so we keep
falling back to hand-rolled generations. **Track A (the connector seam) is the unlock**: it
turns the good code that already exists into the thing that actually runs.
