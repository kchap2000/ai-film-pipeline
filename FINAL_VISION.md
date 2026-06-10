# AI FILM PIPELINE — FINAL VISION SPEC

> **The Goal:** Upload a script. Get a finished AI-generated video.
> **Two modes.** Auto runs the whole thing. Manual lets you direct every choice.

This document is the single source of truth for what this product is supposed to be. Every Claude Code session should read this FIRST, then CLAUDE.md for dev rules, then PROGRESS.md for current state.

---

## THE TWO MODES

### Auto Mode
Script goes in → video comes out. Zero manual intervention. The pipeline runs every phase automatically, AI selects the best option at each gate (best-of-N casting, best location match, best scene scout), and produces a finished video with all story beats verified.

**Who it's for:** Fast iteration. "I have a script, show me what this looks like as a film in 30 minutes."

**How it works:**
1. Upload script (PDF/DOCX/TXT)
2. Claude extracts characters, scenes, locations, structure
3. Film Bible auto-generates
4. AI Casting: generate 10 variations per character, auto-select highest-quality option (or use a scoring model)
5. Character Lock: auto-generate pose sheets, auto-lock all
6. Location Scouting: generate 5 per location, auto-approve best match to script description
7. Scene Scouting: generate 3 per scene, auto-approve best atmospheric match
8. Storyboard: Claude breaks scenes into shots, Gemini renders panels
9. First Frames: photorealistic identity-locked frames per shot
10. **Video Generation:** each first frame → animated video clip via Higgsfield
11. **Video Assembly:** clips stitched into scenes → full video
12. **QA Analysis:** Claude watches the video, checks every beat against the screenplay, reports what hit and what drifted

At the end, you get: a full video + a QA report showing beat accuracy.

### Manual Mode
Same pipeline, but you're the director. At every phase gate, an AI agent is available to take your direction via natural language.

**Who it's for:** Production work. "I want to carefully craft this — iterate on casting, adjust locations, refine the cinematic style."

**How it works:**
Same 12 phases, but each one pauses for human review. On every page, there's an agent chat where you can say things like:
- "Make Donna's hair darker and curlier"
- "This location should feel more like a Wes Anderson set"
- "Push the camera in instead of panning left"
- "The mood here should be warmer, more golden hour"
- "Regenerate this shot but keep the composition"

The agent interprets your direction, maps it to the right API action (update description → regenerate → show you the result), and you approve or keep iterating.

**The agent is NOT a chatbot.** It's a co-director with full context of the project — it knows the script, the characters, the locked casting choices, the production notes, the visual style. It makes informed suggestions and executes changes.

---

## CURRENT STATE — WHAT EXISTS TODAY

### Working Pipeline (Phases 1-9) — KEEP ALL OF THIS
Every phase below is built, tested, and deployed on Vercel:

| Phase | What It Does | Status |
|-------|-------------|--------|
| 1. Script Ingestion | Upload PDF/DOCX/TXT | ✅ Working |
| 2. LLM Extraction | Claude parses characters, scenes, locations | ✅ Working |
| 3. Film Bible | Auto-generated, inline-editable | ✅ Working |
| 4. AI Casting | 10 Gemini variations per character OR upload headshot | ✅ Working |
| 5. Character Lock | Approve headshot + generate identity-locked pose sheet | ✅ Working |
| 6. Location Scouting | 5 AI images per location, approve best | ✅ Working |
| 7. Scene Scouting | 3 atmospheric images per scene, approve best | ✅ Working |
| 8. Storyboard | Claude breaks scenes into shots, Gemini renders panels with identity refs | ✅ Working |
| 9. First Frames | Photorealistic identity-locked frames per shot | ✅ Working |

### Feature Sprawl (Half-Built) — CUT OR REFACTOR

Multiple sessions added features that are scaffolded but never used. These live on unmerged feature branches and have empty Supabase tables:

| Feature | Tables | Rows | Verdict |
|---------|--------|------|---------|
| Wardrobe Continuity | `wardrobe_items` | 0 | **DROP** — premature. Revisit after video gen works. |
| Generation Jobs | `generation_jobs` | 0 | **REFACTOR** — concept is needed for auto-pipeline job queue, but current implementation is wrong shape. |
| Project Collaborators | `project_collaborators` | 0 | **DROP** — multi-user is a post-launch feature. |
| Project Decisions | `project_decisions` | 0 | **DROP** — production notes already serve this purpose. |
| Project Continuity Rules | `project_continuity_rules` | 0 | **DROP** — premature abstraction. |
| Project Activity | `project_activity` | 3 | **KEEP** — useful audit trail, light footprint. |
| Project Feedback | `project_feedback` | 1 | **DROP** — fold into agent chat history. |
| Asset Provenance | `asset_provenance` | 32 | **KEEP** — needed for staleness detection and cascade regen. Core infrastructure for both modes. |

**Unmerged branches to reconcile:**
The current branch (`feature/generation-jobs-review-workroom`) has 9 commits ahead of main with new routes for `/agent-plans`, `/brain`, `/home`, `/wardrobe`, plus a review page and wardrobe page. **Do NOT merge this branch as-is.** Cherry-pick only the provenance infrastructure (asset_provenance, version columns) and discard the rest.

### Supabase Cleanup SQL (run before new development)

```sql
-- Drop empty/unused tables from feature sprawl
DROP TABLE IF EXISTS wardrobe_items CASCADE;
DROP TABLE IF EXISTS generation_jobs CASCADE;
DROP TABLE IF EXISTS project_collaborators CASCADE;
DROP TABLE IF EXISTS project_decisions CASCADE;
DROP TABLE IF EXISTS project_continuity_rules CASCADE;
DROP TABLE IF EXISTS project_feedback CASCADE;

-- Keep: asset_provenance, project_activity (both have data and serve the vision)
```

### Git Cleanup
1. Switch to `main`
2. Create a fresh branch `feature/final-pipeline` from main
3. All new work goes on this branch
4. Old feature branches can be deleted after cherry-picking any useful code

---

## THE COMPLETE PIPELINE — 12 PHASES

### Phases 1-9: BUILT (see PROGRESS.md for details)
No changes needed to the core flow. These work.

### Phase 10: Video Generation (NEW — PRIMARY BUILD TARGET)

**What:** Take each approved first frame and animate it into a 3-10 second video clip using Higgsfield AI.

**Models (via Higgsfield MCP connector `mcp__99d29aaf-*`):**

| Shot Type | Model | Why |
|-----------|-------|-----|
| Character-heavy (dialogue, action) | `seedance_2_0` | Best identity consistency, up to 15s |
| Cinematic establishing shots | `cinematic_studio_3_0` | Multi-shot cinematic, highest fidelity |
| Ambient/atmospheric with audio | `kling3_0` + `mode: "pro"` | Built-in ambient sound, single continuous shot |

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS video_clips (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  panel_id uuid NOT NULL REFERENCES storyboard_panels(id) ON DELETE CASCADE,
  first_frame_id uuid REFERENCES first_frames(id) ON DELETE SET NULL,
  -- Higgsfield job tracking
  higgsfield_job_id text,
  status text NOT NULL DEFAULT 'pending', -- pending, generating, completed, failed, approved
  -- Result
  video_url text,            -- Higgsfield CDN URL or local storage
  duration_seconds numeric,
  model_used text NOT NULL,
  prompt_used text NOT NULL,
  -- Metadata
  motion_description text,   -- camera movement + action description
  retry_count integer DEFAULT 0,
  parent_clip_id uuid REFERENCES video_clips(id) ON DELETE SET NULL, -- regen lineage
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_clips_project ON video_clips(project_id);
CREATE INDEX IF NOT EXISTS idx_video_clips_panel ON video_clips(panel_id);
```

**Generation Logic:**
```
For each storyboard panel (in scene order):
  1. Get approved first frame image URL
  2. Get shot metadata: action_description, camera_movement, duration_seconds, characters_in_shot
  3. Select model based on shot characteristics
  4. Upload first frame to Higgsfield via media_upload → media_confirm
  5. Build motion prompt from: camera_movement + action_description + mood
  6. Call generate_video with: model, prompt, reference image, duration
  7. Poll job_display until complete
  8. Store result in video_clips table
```

**Auto Mode behavior:** Generate all clips sequentially. Auto-approve on completion. Move to assembly.

**Manual Mode behavior:** Generate clips, show each for review. Agent chat available: "Make the camera push in slower" → regenerate with adjusted motion prompt. Approve/reject per clip.

**API Routes:**
- `GET /api/projects/:id/video-clips` — list all clips (metadata only, no video data in bulk)
- `POST /api/projects/:id/video-clips` — generate. `{ panel_id }` for single, no body = bulk
- `PATCH /api/projects/:id/video-clips` — approve/reject clip
- `POST /api/projects/:id/video-clips/regenerate` — `{ clip_id, motion_prompt? }` → new attempt

### Phase 11: Video Assembly (NEW)

**What:** Stitch approved video clips into scene sequences, then combine scenes into a full video.

**How:** Use FFmpeg (available in the sandbox) or a cloud video API to:
1. Concatenate clips within each scene (cut transitions between shots)
2. Add scene transitions (fade to black between scenes, or dissolve)
3. Export per-scene videos AND a full project video
4. Optional: add title cards, scene labels

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS assembled_videos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'full', -- 'scene' or 'full'
  scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL, -- NULL for full project video
  video_url text,
  duration_seconds numeric,
  clip_count integer,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
```

**Auto Mode:** Assemble automatically after all clips are generated.
**Manual Mode:** Preview per-scene assembly, adjust clip order/transitions, then assemble full.

### Phase 12: QA — Beat Analysis (NEW)

**What:** Claude watches the assembled video (via frame sampling or video description) and checks every story beat against the original screenplay.

**How:**
1. For each scene's assembled video:
   - Sample key frames at 1-2 second intervals
   - Send frames + screenplay text to Claude
   - Claude analyzes: Does this scene hit the beats? Are characters recognizable? Does the mood match? Is the camera work what was specified?
2. Produce a QA Report:
   - Per-scene beat accuracy score (0-100%)
   - Specific callouts: "Scene 2, shot 4: camera was supposed to push in but appears static"
   - Character consistency flags: "Jeff appears different in shots 3 and 7"
   - Mood alignment: "Scene 1 should be intimate/warm but reads as cold/sterile"
   - Recommended re-generation targets

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS qa_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assembled_video_id uuid REFERENCES assembled_videos(id) ON DELETE SET NULL,
  overall_score numeric, -- 0-100
  beat_accuracy jsonb,   -- per-scene scores + notes
  character_flags jsonb,  -- inconsistency callouts
  mood_flags jsonb,       -- mood alignment issues
  regen_targets jsonb,    -- specific shots to redo
  created_at timestamptz DEFAULT now()
);
```

**Auto Mode:** Run QA automatically. If score < threshold, auto-regenerate flagged shots and re-assemble. Loop until score passes or max retries hit.
**Manual Mode:** Present QA report to director. They decide what to fix.

---

## AUTO-PIPELINE ORCHESTRATOR

The orchestrator is the engine that makes Auto Mode work. It's a single API endpoint that kicks off and manages the entire pipeline.

### API: `POST /api/projects/:id/auto-pipeline`

**Request:** `{ mode: 'auto' | 'manual', start_from_phase?: number }`

**Auto Mode Logic:**
```
1. Verify script is uploaded
2. Run extraction (Claude)
3. Generate Film Bible
4. For each character:
   - Generate 10 cast variations
   - Score variations (Gemini or Claude vision)
   - Auto-select top-scored variation
   - Auto-lock character
5. Generate pose sheets for all locked characters
6. For each location:
   - Generate 5 variations
   - Score against script description
   - Auto-approve best match
7. For each scene:
   - Generate 3 scout images
   - Score against mood + location
   - Auto-approve best match
8. Generate storyboard (Claude shot breakdown + Gemini panels)
9. Generate first frames (identity-locked photorealistic)
10. For each panel → generate video clip (Higgsfield)
11. Assemble clips into scenes → full video
12. Run QA analysis
13. If QA score < 80%:
    - Identify worst-scoring shots
    - Regenerate those shots (first frame → video clip)
    - Re-assemble
    - Re-run QA
    - Max 3 QA loops
14. Return: { video_url, qa_report, total_duration, phase_timings }
```

**Schema for orchestrator state:**
```sql
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'auto', -- 'auto' or 'manual'
  current_phase integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'running', -- running, paused, completed, failed
  phase_timings jsonb DEFAULT '{}', -- { "extraction": 12.5, "casting": 45.2, ... }
  error_log jsonb DEFAULT '[]',
  qa_loops_completed integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
```

### Auto-Selection Logic (Best-of-N)

For phases that generate multiple variations, Auto Mode needs to pick the best one without human input:

**Casting (best of 10):** Use Claude Vision to score each variation against the character description. Prompt: "Rate this image 1-10 on how well it matches this character description: {description}. Consider: age accuracy, physical description match, casting quality, photorealism."

**Location Scouting (best of 5):** Score against location description + time of day + mood.

**Scene Scouting (best of 3):** Score against mood + character presence + location match.

This scoring can use `claude-haiku-4-5-20251001` for speed — it's a vision-capable model that's fast and cheap.

---

## AGENT REVISION SYSTEM (Manual Mode)

### Architecture

Each pipeline page gets an agent chat panel (collapsible sidebar or bottom drawer). The agent has:
- Full project context (script, characters, scenes, locations, production notes)
- Knowledge of what phase the project is in
- Access to all API routes (can regenerate, update descriptions, approve/reject)

### How It Works

```
User types: "Make the kitchen location more rustic — exposed brick, warm wood tones"

Agent:
1. Identifies this is about a LOCATION (kitchen)
2. Looks up the location record
3. Updates location.description with the new direction
4. Bumps location.version
5. Calls the location generation endpoint with the new description
6. Shows the user the new variations
7. Notes that downstream assets (scene scouts, storyboard panels) are now STALE
8. Asks: "Want me to regenerate the scene scouts and storyboard panels that use this location?"
```

### Implementation

**API Route:** `POST /api/projects/:id/agent`
```typescript
{
  message: string,      // user's natural language input
  context: {
    current_page: string,  // 'cast' | 'lock' | 'locations' | 'scenes' | 'storyboard' | 'first-frames' | 'video'
    selected_item_id?: string  // which character/location/scene/panel is selected
  }
}
```

**Response:**
```typescript
{
  reply: string,         // agent's response text
  actions_taken: Array<{
    type: string,        // 'updated_description' | 'regenerated' | 'approved' | 'flagged_stale'
    target: string,      // what was affected
    result: any          // outcome
  }>,
  suggestions: string[]  // follow-up suggestions
}
```

The agent uses Claude with a system prompt that includes the full project state and a function-calling interface mapping to the existing API routes. This is NOT a new AI system — it's Claude with tools.

### UI Component

```
┌─────────────────────────────────────────────┐
│  [Location Scouting Page]                    │
│                                              │
│  [Location variations grid...]               │
│                                              │
├─────────────────────────────────────────────┤
│  🎬 Director's Chat                         │
│  ─────────────────────────────              │
│  You: Make this more rustic, exposed brick   │
│  Agent: Updated Kitchen description. Generating │
│         5 new variations with rustic theme... │
│         [3 downstream assets flagged stale]   │
│  ─────────────────────────────              │
│  [Type your direction...]            [Send]  │
└─────────────────────────────────────────────┘
```

---

## AI MODELS USED

| Task | Model | Why |
|------|-------|-----|
| Script extraction | `claude-sonnet-4-6` | Best structured output for parsing screenplays |
| Shot breakdown | `claude-sonnet-4-6` | Understands cinematic structure |
| Auto-selection scoring | `claude-haiku-4-5-20251001` | Fast + vision-capable for scoring variations |
| Agent chat | `claude-sonnet-4-6` | Needs to be smart enough to interpret director intent |
| QA Analysis | `claude-sonnet-4-6` | Needs vision + narrative understanding |
| Cast/location/scene images | Gemini Flash | Fast iteration, good quality |
| Storyboard panels | Gemini Flash + multimodal refs | Identity-locked via headshot references |
| First frames | Gemini Pro (when available) | Higher quality photorealistic output |
| Video clips | Higgsfield (seedance_2_0 / cinematic_studio_3_0 / kling3_0) | Best available AI video models |

---

## PROVENANCE + STALENESS (from Project Brain — KEEP THIS)

The provenance system from PROGRESS.md (Parts 1-9 of the Project Brain section) is correct and essential for both modes. It ensures that when a source asset changes, all downstream assets are flagged stale and can be regenerated in the right order.

**Keep:**
- `asset_provenance` table
- `version` columns on characters, locations, scenes, projects
- `recordProvenance()` and `bumpVersion()` helpers
- Staleness detection endpoint
- Cascade regeneration endpoint

**This is not optional.** Without provenance, changing a headshot silently breaks every downstream image. The system must track what was built from what.

---

## IMPLEMENTATION ROADMAP — PRIORITY ORDER

### Sprint 1: Foundation (Cleanup + Provenance)
1. Git cleanup: switch to main, create fresh `feature/final-pipeline` branch
2. Supabase cleanup: drop unused tables (see SQL above)
3. Cherry-pick provenance infrastructure from feature branch (version columns, asset_provenance)
4. Implement `recordProvenance()` and `bumpVersion()` helpers
5. Wire version bumping into all existing mutation routes
6. Wire provenance recording into all existing generation routes
7. Build staleness detection endpoint
8. Add staleness badges to existing UI pages

### Sprint 2: Auto-Pipeline Orchestrator
1. Build `pipeline_runs` table and orchestrator endpoint
2. Implement auto-selection scoring (Claude Vision scoring for best-of-N)
3. Build the sequential auto-pipeline that runs phases 1-9 without human input
4. Test end-to-end: upload script → auto-run through first frames
5. Add progress tracking UI (pipeline status page showing which phase is running)

### Sprint 3: Video Generation (Phase 10)
1. Build `video_clips` table
2. Implement Higgsfield integration via MCP connector
3. Build per-shot video generation with model selection logic
4. Build video generation API routes
5. Build video clips UI page (grid of clips, approve/reject, regenerate)
6. Wire into auto-pipeline

### Sprint 4: Assembly + QA (Phases 11-12)
1. Build `assembled_videos` table
2. Implement FFmpeg-based clip stitching
3. Build assembly API routes
4. Build `qa_reports` table
5. Implement Claude-based QA analysis
6. Build QA report UI
7. Wire QA loop into auto-pipeline (auto-regen if score < 80%)

### Sprint 5: Agent Revision System (Manual Mode)
1. Build agent API endpoint with Claude function calling
2. Map agent actions to existing API routes
3. Build chat UI component
4. Integrate chat component into every pipeline page
5. Test: natural language revision → AI executes → result shown

### Sprint 6: Polish + Deploy
1. Mode selection on project creation ("Auto" / "Manual")
2. Pipeline progress dashboard (real-time status for auto runs)
3. Final video player page with QA report overlay
4. Export options (download video, download QA report, download storyboard PDF)
5. Performance optimization (parallel generation where possible)
6. Full end-to-end test on WAYW Ep2

---

## WHAT THIS IS NOT

This is NOT:
- A multi-user collaboration tool (that's post-launch)
- A real-time video editor (we generate, we don't edit frame-by-frame)
- A general-purpose AI art tool (it's specifically for screenplay → video)
- A social platform (no sharing, no public galleries)

This IS:
- A production pipeline that turns a written script into a visual film
- Two modes: fully automatic or director-guided
- End-to-end: script in, video out
- Built on the best available AI models at each stage

---

## TECHNICAL NOTES FOR CLAUDE CODE

1. **Read this file first, then CLAUDE.md, then PROGRESS.md**
2. **The auth stub stays** — no user_id filtering until Khalil says "go" on auth
3. **No base64 in bulk responses** — always use dedicated `/image` endpoints
4. **Vercel 300s timeout** — batch generation per-item, not all-at-once
5. **Higgsfield MCP** — use `mcp__99d29aaf-*` tools, NOT curl/fetch. Load schemas via ToolSearch.
6. **All generation must record provenance** — no exceptions
7. **All source mutations must bump versions** — no exceptions
8. **Auto-pipeline must be resumable** — if it fails mid-run, pick up where it left off using `pipeline_runs.current_phase`
