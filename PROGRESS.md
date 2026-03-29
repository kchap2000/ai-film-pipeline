# AI Film Pipeline — Progress Log

## Phase 1: Project Dashboard & Creation Flow ✅ COMPLETE

### Completed — March 24, 2026

**Scaffolding**
- [x] Next.js 14 (App Router) project with TypeScript
- [x] Tailwind CSS configured
- [x] Supabase JS client installed and wired up (`src/lib/supabase.ts`)
- [x] Project directory structure established

**Database Schema** (`supabase/schema.sql`)
- [x] `projects` table — id, title, type (client/personal), client_name, phase_status enum, timestamps
- [x] `project_files` table — id, project_id (FK), file_name, file_type, file_size, storage_path, uploaded_at
- [x] Phase status enum: ingestion → extraction → bible → casting → lock → scene_bible → storyboard
- [x] Auto-update trigger on `updated_at`
- [x] Storage bucket config for `project-uploads`
- [x] Schema deployed to Supabase (confirmed March 25, 2026)

**API Routes**
- [x] `GET /api/projects` — list all projects (sorted by newest)
- [x] `POST /api/projects` — create project (title, type, client_name)
- [x] `GET /api/projects/:id` — get project + associated files
- [x] `POST /api/upload` — upload file to Supabase Storage + record in project_files

**UI Pages**
- [x] `/` — Project dashboard with grid of project cards
- [x] `/projects/new` — Project creation form
- [x] `/projects/:id` — Project detail page

**Components**
- [x] `ProjectCard` — dashboard card with phase indicator
- [x] `PhaseIndicator` — 7-dot pipeline progress visualization
- [x] `FileUpload` — drag-and-drop + browse file uploader

---

## Phase 2: LLM Extraction Engine ✅ COMPLETE

### Built — March 25, 2026

**Anthropic SDK**
- [x] Installed `@anthropic-ai/sdk`
- [x] `ANTHROPIC_API_KEY` configured in `.env.local`

**Extraction Function** (`src/lib/extract.ts`)
- [x] Calls Claude claude-sonnet-4-5 with detailed system prompt
- [x] Extracts: characters, scenes, structure (acts, logline, themes, genre)
- [x] Returns typed `ExtractionResult` interface

**Database Schema** (`supabase/schema.sql` — Phase 2 additions)
- [x] `characters` table — id, project_id (FK), name, description, role (enum), personality
- [x] `scenes` table — id, project_id (FK), scene_number, location, time_of_day, action_summary, mood, props[], wardrobe (jsonb), characters_present[], locked
- [x] `extractions` table — id, project_id (FK), structure (jsonb), raw_response
- [x] `character_role` enum: lead, supporting, minor, extra, mentioned
- [ ] **ACTION NEEDED:** Run Phase 2 SQL (bottom of `supabase/schema.sql`) in Supabase SQL Editor

**API Route** (`src/app/api/extract/route.ts`)
- [x] `POST /api/extract` — fetches files, extracts text, runs Claude, saves results
- [x] Basic text extraction for TXT, PDF, and DOCX formats
- [x] Idempotent (clears previous extraction on re-run)
- [x] Advances project phase_status to `extraction`

**UI — Extraction Trigger** (`src/app/projects/[id]/page.tsx`)
- [x] "Run Extraction" button on project detail page
- [x] Loading state while Claude processes
- [x] Shows character/scene count on success
- [x] "Re-Extract" option if extraction already ran
- [x] Link to Film Bible appears after extraction

---

## Phase 3: Film Bible (Auto-Generated) ✅ COMPLETE

### Built — March 25, 2026

**API Route** (`src/app/api/projects/[id]/bible/route.ts`)
- [x] `GET /api/projects/:id/bible` — returns project, characters, scenes, extraction structure
- [x] `POST /api/projects/:id/bible` — approves bible, advances phase to `bible`

**UI Page** (`src/app/projects/[id]/bible/page.tsx`)
- [x] Three-tab layout: Overview, Characters, Scenes
- [x] Overview tab: logline, genre, themes, act structure, summary stats
- [x] Characters tab: sorted by role (lead → extra), description + personality
- [x] Scenes tab: scene number, location, time of day, mood, action summary, characters present, props, wardrobe
- [x] Role-colored badges (amber for leads, blue for supporting, etc.)
- [x] Phase Gate: "Approve & Lock Bible" button advances project to casting phase
- [x] Shows "Film Bible approved" if already locked

---

## Build Log

| Date | Entry |
|------|-------|
| 2026-03-24 | Phase 1 scaffolded: project dashboard, creation flow, file upload |
| 2026-03-25 | Phase 1 schema deployed to Supabase |
| 2026-03-25 | Phase 2 built: extraction function, API route, DB schema, types |
| 2026-03-25 | Phase 2 UI: extraction trigger button + result display on project detail |
| 2026-03-25 | Phase 3 built: Film Bible page with tabs, phase gate approval |
| 2026-03-25 | Phase 4 built: AI Casting — image gen, casting UI, approve/reject flow |
| 2026-03-25 | Phase 4 updated: swapped to Gemini 2.5 Flash for image generation |
| 2026-03-25 | Phase 5 built: Character Lock & Reference Poses |
| 2026-03-25 | Phase 6 built: Location & Scene Bible |
| 2026-03-25 | Phase 7 built: Storyboard Generation — PIPELINE COMPLETE |
| 2026-03-26 | UX fix: navigation dead-ends — Bible extraction button, Cast empty state, early phase links |
| 2026-03-27 | Bug fixes B1-B6: stale phase status, Bible approve UX, cast API timeouts + error feedback, sidebar status |
| 2026-03-28 | Deployed to Vercel — live at https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app |
| 2026-03-28 | Fixed Gemini model: upgraded to gemini-3.1-flash-image-preview (confirmed generating real JPEG images) |
| 2026-03-28 | Fixed Claude model: updated extract.ts to claude-sonnet-4-6 (needs push + redeploy) |
| 2026-03-28 | DB cleanup: deleted 11 SVG placeholder cast_variations, deleted Test project, cleared approved_cast_id |
| 2026-03-28 | Verified both Google AI and Anthropic APIs working with billing enabled |
| 2026-03-28 | Claude extraction confirmed working end-to-end (claude-sonnet-4-6) — 5 chars, 3 scenes from WAYW Ep2 |

---

## Phase 4: AI Casting (Character Visualization) ✅ COMPLETE

### Built — March 25, 2026

**Image Generation** (`src/lib/generate-image.ts`)
- [x] Gemini 2.5 Flash (gemini-2.5-flash-preview-05-20) via `@google/genai` SDK
- [x] Native image output using `responseModalities: [Modality.IMAGE, Modality.TEXT]`
- [x] 10 prompt variations per character (different angles/poses per variation)
- [x] Graceful fallback to placeholder SVGs if API key not set or Gemini fails
- [x] Set `GOOGLE_AI_API_KEY` in `.env.local` to enable

**Database Schema** (`supabase/schema.sql` — Phase 4 additions)
- [x] `cast_variations` table — id, character_id (FK), project_id (FK), image_url, storage_path, prompt_used, status, rejection_note, variation_number
- [x] Added `approved_cast_id` and `locked` columns to `characters` table
- [ ] **ACTION NEEDED:** Run Phase 4 SQL (bottom of `supabase/schema.sql`) in Supabase SQL Editor

**API Route** (`src/app/api/projects/[id]/cast/route.ts`)
- [x] `GET /api/projects/:id/cast` — returns characters with their variations grouped
- [x] `POST /api/projects/:id/cast` — generates 10 variations per character (or per single character)
- [x] `PATCH /api/projects/:id/cast` — approve/reject a variation with optional note
- [x] Approving auto-rejects other pending variations for that character
- [x] Sets `approved_cast_id` on character when approved
- [x] Advances project phase to `casting`

**UI Page** (`src/app/projects/[id]/cast/page.tsx`)
- [x] Character sidebar with role labels and cast status (CAST / REVIEW)
- [x] 5-column variation grid with approve/reject buttons
- [x] Rejection note input (optional)
- [x] Approved variations highlighted green, rejected dimmed
- [x] "Generate All Variations" button or per-character generate
- [x] "All characters cast" status with link to next phase

**Project Detail** (`src/app/projects/[id]/page.tsx`)
- [x] AI Casting link appears after bible phase

**Types** (`src/lib/types.ts`)
- [x] Added `CastVariation` interface and `CastVariationStatus` type
- [x] Added `approved_cast_id` and `locked` to `Character` interface

---

## Phase 5: Character Lock & Reference Poses ✅ COMPLETE

### Built — March 25, 2026

**Database Schema** (`supabase/schema.sql` — Phase 5 additions)
- [x] `character_poses` table — id, character_id (FK), project_id (FK), pose_type, image_url, prompt_used
- [x] Added `pose_refs` (jsonb) column to `characters` table
- [ ] **ACTION NEEDED:** Run Phase 5 SQL (bottom of `supabase/schema.sql`) in Supabase SQL Editor

**Image Generation** (`src/lib/generate-image.ts`)
- [x] Added `generatePoseImage()` — generates front/3-quarter/profile reference poses via Gemini
- [x] Dedicated pose prompt builder with studio lighting + neutral background instructions

**API Route** (`src/app/api/projects/[id]/lock/route.ts`)
- [x] `GET /api/projects/:id/lock` — returns cast characters with poses + approved headshot
- [x] `POST /api/projects/:id/lock` — generates 3 reference poses per cast character
- [x] `PATCH /api/projects/:id/lock` — lock individual character or lock all
- [x] Updates `pose_refs` JSON on character after pose generation
- [x] Advances project phase to `lock` when all characters locked

**UI Page** (`src/app/projects/[id]/lock/page.tsx`)
- [x] 4-column grid per character: approved cast + front + 3/4 + profile
- [x] Per-character generate and lock buttons
- [x] "Generate All Poses" and "Lock All Characters" bulk actions
- [x] Locked status badge per character
- [x] Phase complete message with continue link

**Project Detail** (`src/app/projects/[id]/page.tsx`)
- [x] Character Lock link appears after casting phase

---

## Phase 6: Location & Scene Bible ✅ COMPLETE

### Built — March 25, 2026

**Database Schema** (`supabase/schema.sql` — Phase 6 additions)
- [x] `locations` table — id, project_id (FK), name, description, time_of_day, mood, locked, approved_image_url
- [x] `location_variations` table — id, location_id (FK), project_id (FK), image_url, prompt_used, status, rejection_note, variation_number
- [x] Added `location_id` FK column to `scenes` table
- [ ] **ACTION NEEDED:** Run Phase 6 SQL (bottom of `supabase/schema.sql`) in Supabase SQL Editor

**Image Generation** (`src/lib/generate-image.ts`)
- [x] Added `generateLocationImage()` — generates location reference images via Gemini
- [x] 5 prompt variations per location (wide establishing, medium detail, atmospheric, high angle, low angle)

**API Route** (`src/app/api/projects/[id]/locations/route.ts`)
- [x] `GET /api/projects/:id/locations` — returns locations with variations + linked scenes
- [x] `POST /api/projects/:id/locations` — extracts unique locations from scenes + generates 5 variations each
- [x] `PATCH /api/projects/:id/locations` — approve/reject variation, lock individual or all locations
- [x] Auto-deduplicates locations from scene data
- [x] Approving sets approved_image_url and rejects other pending variations

**UI Page** (`src/app/projects/[id]/locations/page.tsx`)
- [x] Location sidebar with lock/approved/review status
- [x] 5-column variation grid with approve/reject + rejection notes
- [x] Linked scenes panel showing all scenes at the selected location
- [x] "Lock All Locations" bulk action
- [x] Phase complete message with continue link

**Project Detail** (`src/app/projects/[id]/page.tsx`)
- [x] Location Bible link appears after lock phase

---

## Phase 7: Storyboard Generation ✅ COMPLETE

### Built — March 25, 2026

**Database Schema** (`supabase/schema.sql` — Phase 7 additions)
- [x] `storyboard_panels` table — id, project_id (FK), scene_id (FK), panel_number, shot_type, camera_angle, camera_movement, action_description, dialogue, characters_in_shot, image_url, prompt_used, duration_seconds, notes
- [ ] **ACTION NEEDED:** Run Phase 7 SQL (bottom of `supabase/schema.sql`) in Supabase SQL Editor

**Image Generation** (`src/lib/generate-image.ts`)
- [x] Added `generateStoryboardPanel()` — generates cinematic storyboard panel images via Gemini
- [x] Prompt includes shot type, camera angle/movement, characters with descriptions, location context, mood

**API Route** (`src/app/api/projects/[id]/storyboard/route.ts`)
- [x] `GET /api/projects/:id/storyboard` — returns all panels grouped by scene with character + location context
- [x] `POST /api/projects/:id/storyboard` — uses Claude to break scenes into 3-8 shots each, then generates panel images via Gemini
- [x] Claude shot breakdown: shot_type, camera_angle, camera_movement, action_description, dialogue, characters_in_shot, duration
- [x] Supports single-scene or all-scene generation
- [x] Advances project phase to "storyboard"

**UI Page** (`src/app/projects/[id]/storyboard/page.tsx`)
- [x] Accordion scene list with expand/collapse
- [x] Cast reference strip at top
- [x] Panel grid per scene (6 columns) with hover overlays showing shot info
- [x] Shot metadata: type, angle, movement, duration, dialogue, characters
- [x] Generate per-scene or all at once
- [x] Scene status badges (BOARDED / PENDING)
- [x] Pipeline complete summary with total panels + estimated runtime

**Project Detail** (`src/app/projects/[id]/page.tsx`)
- [x] Storyboard link appears after scene bible phase

---

## ALL PHASES COMPLETE

| Phase | Status |
|-------|--------|
| 01 — Project Setup & Ingestion | ✅ |
| 02 — LLM Extraction Engine | ✅ |
| 03 — Character Bible & Casting | ✅ |
| 04 — AI Casting (Gemini) | ✅ |
| 05 — Character Lock & Reference Poses | ✅ |
| 06 — Location & Scene Bible | ✅ |
| 07 — Storyboard Generation | ✅ |

---

## BUG LIST (from 2026-03-26 audit)

| # | Page | Bug | Priority | Status |
|---|------|-----|----------|--------|
| B1 | Project Detail | Phase status still shows "Asset Ingestion / Phase 1 of 7" even after extraction runs — not updating from DB | High | ✅ Fixed — added `force-dynamic` to API routes to prevent Next.js caching |
| B2 | Project Detail | No navigation to Bible or Casting after extraction — only Dashboard + Run Extraction visible | High | ✅ Fixed — Bible + Casting links already show when `hasExtracted` is true; root cause was B1 stale cache |
| B3 | Film Bible | Phase gate "Film Bible Approved" is a DIV not a button — cannot click to advance phase | High | ✅ Fixed — added "Continue to AI Casting" link after bible is approved |
| B4 | AI Casting | Cast API hangs silently with no error when GOOGLE_AI_API_KEY is missing — no user feedback | High | ✅ Fixed — API returns errors array; UI shows error panel after generation |
| B5 | AI Casting | Sidebar shows all characters as "CAST" status when no images have been generated | Medium | ✅ Fixed — CAST badge now requires both `approved_cast_id` AND `variations.length > 0` |
| B6 | AI Casting | No timeout on cast API — request hangs indefinitely | Medium | ✅ Fixed — 60s per-image timeout via `Promise.race`; `maxDuration = 300` on route |
| B7 | Storyboard | `POST /api/projects/:id/storyboard` returns 503 — wrong Claude model string `claude-sonnet-4-5-20250514` in route | Critical | ✅ Fixed — changed to `claude-sonnet-4-6` in `src/app/api/projects/[id]/storyboard/route.ts` line 119 |
| B8 | Location, Storyboard | No loading indicator in content area during AI generation — UI appears frozen for 60–90s | High | ✅ Fixed — added animated bounce spinner + descriptive message to location and storyboard pages during generation |
| B9 | Location, Storyboard | API errors silently swallowed — no user feedback on failure | High | ✅ Fixed — added try/catch with genError state and dismissible red error banner on both pages |
| B10 | Extract API | pdf-parse fails on Vercel serverless even with lazy loading — test-file init runs at call time and throws, catch block returns empty string | Critical | ✅ Fixed in sandbox — changed to `require("pdf-parse/lib/pdf-parse.js")` to skip test-file initialization. Awaiting Claude Code push. |

---

### Remaining Work (Post-Pipeline)
- [ ] Auth (Supabase Auth or Clerk)
- [x] Deploy to Vercel — live 2026-03-28
- [x] Gemini image generation working end-to-end (gemini-3.1-flash-image-preview)
- [x] Push extract.ts Claude model fix + redeploy — pushed 7263c8a, deployed dpl_23d4zcfnwsQan89PawSP8VbLe6c2
- [x] Run final extraction test post-redeploy — confirmed: 5 characters, 3 scenes extracted via claude-sonnet-4-6
- [x] Full live browser UI/UX audit (2026-03-29) — all 7 phases walked through, 3 bugs found (B7/B8/B9)
- [x] Fixed B7/B8/B9 in sandbox (2026-03-29) — Claude Code deployed commit 75cdc91
- [x] B7 confirmed working in production — storyboard POST returns 200, Scene 1 generated 7 cinematic panels
- [x] WAYW Ep2 PDF tested — discovered pdf-parse still fails on Vercel (test-file loading issue even with lazy load)
- [x] Fix: changed to require("pdf-parse/lib/pdf-parse.js") to bypass test-file init — awaiting Claude Code push
