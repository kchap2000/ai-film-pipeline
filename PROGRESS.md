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
| B10 | Extract API | pdf-parse fails on Vercel serverless even with lazy loading — test-file init runs at call time and throws, catch block returns empty string | Critical | ✅ Fixed — changed to `require("pdf-parse/lib/pdf-parse.js")` (commit 1996bd0). Confirmed working: WAYW Ep2 PDF extracts 4 chars, 21 scenes, full act structure directly from compressed PDF. |

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
- [x] Fix: changed to require("pdf-parse/lib/pdf-parse.js") (commit 1996bd0) — CONFIRMED WORKING in production
- [x] WAYW Ep2 PDF now extracts 4 characters, 21 scenes, full 3-act structure, logline, genre directly from compressed PDF
- [x] Aggressive improvements pass (2026-03-29) — extraction prompt overhaul, voice_only, scene_type, bible inline editing, ProjectNav, cast V.O. handling

---

### Build Log — 2026-04-03
- Cinematic Film Bible redesign: single-scroll layout, Bebas Neue + Barlow Condensed display fonts, large bold character names, headshot photos displayed inline for lead/supporting, section dividers with gold accent, stats bar, themes band, compact secondary character rows
- Bible API updated: now returns `headshot_url` per character (approved cast_variation image pulled via extra query + map)
- globals.css: added Bebas Neue + Barlow Condensed from Google Fonts
- Scene Scouting phase added: 3 atmospheric AI images per scene, approve/reject, scout images used as Gemini reference in storyboard
- Bible inline scene editing: Edit button per scene, inline form for location/time/mood/action/scene_type
- Character Lock redesign: replaced pose grid with headshot + reference sheet layout
- ProjectNav updated with Scene Scout step (8 steps total)
- Project detail phase links corrected with accurate descriptions
- Storyboard character headshots fixed (join from cast_variations), scout image reference used in panel generation
- All generation routes: force-dynamic + maxDuration = 300 added
- TypeScript clean — 0 errors

### ✅ COMPLETE: 2026-04-03 — Scene Scouting, Bible Scene Editing, Pipeline Polish

**New Feature: Scene Scouting (Phase 6.5)**
- [x] `scene_variations` table in schema.sql + `approved_scout_image_url` on scenes table
- [x] `generateSceneScoutImage()` in `generate-image.ts` — atmospheric/mood images per scene
- [x] `POST /api/projects/:id/scenes` — generates 3 images per scene using character descriptions, location, mood, action summary
- [x] `PATCH /api/projects/:id/scenes` — approve/reject variation, lock all scenes
- [x] `GET /api/projects/:id/scenes` — returns scenes with their scout variations
- [x] `/projects/:id/scenes` — full scouting UI: scene sidebar, 3-column variation grid, approve/reject, generate all/per-scene, phase complete footer

**Film Bible Improvements**
- [x] Inline scene editing: location, time_of_day, mood, action_summary, scene_type (select) — Edit/Cancel/Save per scene
- [x] `PATCH /api/projects/:id/bible` now handles both `character_id` (existing) and `scene_id` (new) updates

**Storyboard Improvements**
- [x] `GET /api/storyboard` — fixed character headshots (now joins cast_variations, returns approved_variation_url)
- [x] `POST /api/storyboard` — uses `approved_scout_image_url` as Gemini multimodal reference image for panel generation (consistent atmosphere/color grading)
- [x] `generateStoryboardPanel()` — accepts optional `sceneReferenceImageUrl`, uses multimodal generation when present

**Character Lock**
- [x] Replaced Front/3-Quarter/Profile individual pose grid with character reference sheet display
- [x] Lock no longer requires 3 poses — any character with approved_cast_id can be locked
- [x] Auto-generates pose sheet via `/api/posesheet` if headshot exists but sheet doesn't

**Project Detail & Navigation**
- [x] All phase link labels and descriptions updated to reflect actual pipeline steps
- [x] "Scene Scouting" link added between Location Scouting and Storyboard (shows at phaseIndex >= 5)
- [x] ProjectNav overhauled: custom NAV_STEPS array with Scene Scout as a special unlocked step
- [x] Fixed pre-existing TS error in project detail page (data.characters/scenes ?? 0)
- [x] `force-dynamic` + `maxDuration = 300` added to locations, storyboard, and scenes routes

**DB Migration required (run in Supabase SQL Editor):**
```sql
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS approved_scout_image_url text;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS pose_sheet_url text;
CREATE TABLE IF NOT EXISTS scene_variations (
  id uuid primary key default uuid_generate_v4(),
  scene_id uuid not null references scenes(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  image_url text not null,
  prompt_used text not null default '',
  status text not null default 'pending',
  rejection_note text,
  variation_number integer not null default 1,
  created_at timestamp with time zone default now()
);
CREATE INDEX IF NOT EXISTS idx_scene_variations_scene ON scene_variations(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_variations_project ON scene_variations(project_id);
```

---

### Build Log — 2026-04-04
- Pose sheet prompt replaced: new 9-image cinematic reference format (full body front/profile/back, mid shot emotional, face close-up, feature detail, head profile, low angle, expression variation)
- Pipeline flow transparency: all "Continue" buttons now link directly to next step (Lock→Locations, Locations→Scenes, Cast sidebar→Lock)
- Lock API: individual character lock now also checks all-locked condition and advances phase_status to 'lock'
- Scenes lock_all PATCH now advances phase_status to 'storyboard'
- Project overview: "Next Up" badge with orange highlight on current actionable phase card
- Scene Scouting: "Scout Remaining (N)" button stays visible for partially-scouted projects
- Location Scouting: "Generate Remaining (N)" button stays visible for partially-generated projects

### ✅ COMPLETE: 2026-04-04 — Pipeline Flow Transparency + Pose Sheet Prompt

**Push required from your terminal:**
```bash
cd "/Users/khalilchapman/Desktop/ai-film-pipeline"
git add -A
git commit -m "Pipeline flow transparency + new pose sheet prompt"
git push
```

---

---

## 📌 Pre-Launch Note — Google Auth + Client Access (hold until ready to share)

Before going live with clients, add:
1. **Google OAuth login** — Supabase Auth, `signInWithOAuth({ provider: 'google' })`, callback at `/auth/callback`
2. **user_id on projects table** — every project scoped to the logged-in user; API routes filter by `user.id`
3. **Client portal access** — ability to share specific projects with client emails (read-only view of assets, storyboard, casting picks)
4. **Middleware** — protect all `/projects/*` routes, redirect to `/login` if no session
5. **Sign out button** in ProjectNav

The Claude Code prompt for this is already written — just paste it when ready.

---

### 🔄 Next Up: Deploy Aggressive Improvements Pass

**Requires Claude Code push + Supabase migration:**

1. **Supabase migration** (run in Supabase SQL editor):
   ```sql
   ALTER TABLE characters ADD COLUMN IF NOT EXISTS voice_only boolean NOT NULL DEFAULT false;
   ALTER TABLE scenes ADD COLUMN IF NOT EXISTS scene_type text NOT NULL DEFAULT 'real';
   ```

2. **Files changed in this pass (git commit + push to Vercel):**
   - `src/lib/types.ts` — voice_only on Character, scene_type on Scene
   - `src/lib/extract.ts` — new EXTRACTION_SYSTEM_PROMPT + voice_only/scene_type interfaces
   - `src/app/api/extract/route.ts` — INSERTs now store voice_only and scene_type
   - `src/app/api/projects/[id]/bible/route.ts` — new PATCH handler for inline character editing
   - `src/app/projects/[id]/bible/page.tsx` — inline edit UI (description, personality, role, voice_only toggle), scene_type badge
   - `src/app/projects/[id]/cast/page.tsx` — V.O. badge, skip generate for voice-only chars, purple info panel
   - `src/components/ProjectNav.tsx` — NEW: sticky phase navigation bar (self-fetching)
   - `src/app/projects/[id]/lock/page.tsx` — ProjectNav added
   - `src/app/projects/[id]/locations/page.tsx` — ProjectNav added
   - `src/app/projects/[id]/storyboard/page.tsx` — ProjectNav added
   - `supabase/schema.sql` — migration section appended at bottom

---

### Build Log — 2026-04-13
- Full end-to-end pipeline test (WAYW Episode 2) performed through live app as real user
- Client-side image compression + direct Supabase Storage upload implemented for cast headshots (bypasses Vercel 4.5MB payload limit)
- Real production headshots uploaded: Donna (8.5MB→350KB), Jeff (5.3MB→190KB), Rob (1.1MB→107KB)
- Supabase Storage bucket `project-uploads` fixed: was `public: false`, set to `public: true`
- All 8 pipeline phases completed for WAYW Ep2: 3 scenes, 21 storyboard panels, 83s estimated runtime
- Comprehensive bug report compiled: 13 issues (3 critical, 3 high, 4 medium, 3 low)

### ✅ COMPLETE: 2026-04-13 — Full E2E Pipeline Test + Bug Report

---

## 🔄 Next Up: Fix All Bugs from E2E Pipeline Test

**Full bug report:** `WAYW_Ep2_Pipeline_BugReport.md` (in repo root)

**Project tested:** WAYW Episode 2 — Project ID `c0ee0350-b95d-4a45-8c8d-538e3e252395`

### CRITICAL (fix first)

| # | Bug | Phase | Details |
|---|-----|-------|---------|
| E2E-1 | **Locations table has WRONG Episode 1 data** | Location Scouting | 3 beach locations from Ep1 instead of Donna's Bedroom / Donna's Kitchen / Donna's Pool. 15 AI images generated for wrong environments. All `location_id` on scenes is NULL. Must delete wrong data, create correct Ep2 locations, link scenes, re-generate images. |
| E2E-2 | **Scene → Location linkage is NULL** | Extraction | Extraction creates locations and scenes independently but never sets `location_id` FK on scenes. Post-extraction step needed to match scene location text to location rows. |
| E2E-3 | **Supabase Storage bucket was private** | AI Casting | `project-uploads` bucket had `public: false`. `getPublicUrl()` returned URLs that 400'd. Manually fixed with SQL. Schema/migration must set `public: true` on bucket creation. |

### HIGH PRIORITY

| # | Bug | Phase | Details |
|---|-----|-------|---------|
| E2E-4 | **No cancel button for AI generation** | All gen phases | Accidentally clicked "Generate All (10 each)" on casting — burned 30+ Gemini calls with no way to abort. Need abort flag + Cancel button. |
| E2E-5 | **No "Continue to Storyboard" nav on scene scout page** | Scene Scout → Storyboard | After approving all scenes, no forward navigation appears. Other phases have "Continue to X" links. |
| E2E-6 | **"Generate All" storyboard didn't complete all scenes** | Storyboard | Generated Scene 1 + 2, then Scene 3 stayed PENDING with 0 panels. Had to manually generate Scene 3. No error shown. Need retry/error handling + gap detection. |
| E2E-14 | **Pose sheet doesn't match the headshot (different person)** | Character Lock / Film Bible | The headshot and the pose sheet are generated independently — pose sheet uses a text prompt only, so it produces a different face than the approved headshot. Fix: pass the approved headshot `image_url` as a multimodal reference into `generatePoseSheet()` (same pattern already used in storyboard panel gen with `sceneReferenceImageUrl`). Add a `headshotReferenceImageUrl` param to `generatePoseSheet()` and update `/api/posesheet` to pass `characters.approved_cast_id → cast_variations.image_url` into the Gemini call. Also: wardrobe in the pose sheet prompt should be pulled from the character's `description` field (which contains script wardrobe details), not generic "casual clothes". |
| E2E-15 | **Film Bible missing scene scout images** | Film Bible | Scene scout images (`scenes.approved_scout_image_url`) exist in the DB but aren't displayed on the Film Bible scenes view. Fix: update `/api/projects/:id/bible` to return `approved_scout_image_url` per scene, and render the image inline in `/projects/[id]/bible` next to each scene (like headshots are rendered inline for characters). Lazy-load via the existing `/api/projects/:id/scenes/image?scene_id=xxx&type=approved` endpoint to keep the bulk bible response small. |

### MEDIUM PRIORITY

| # | Bug | Phase | Details |
|---|-----|-------|---------|
| E2E-7 | **Panel count shows "0 panels" during generation** | Storyboard | Header count doesn't update during active generation. Should poll/update in real-time. |
| E2E-8 | **No upload option for reference/pose sheets** | Character Lock | Only "Generate" — no upload for custom production art. Mirror the headshot upload pattern. |
| E2E-9 | **"Continue to Location Scouting" below the fold** | Character Lock | Link exists but requires scrolling past all character cards. Add sticky bar or header button. |
| E2E-10 | **Voice-only characters in storyboard cast strip** | Storyboard | Males Voice 1/2 show with "M" placeholder in CAST REFERENCE strip. Filter `voice_only: true` from visual cast strip. |

### LOW PRIORITY

| # | Bug | Phase | Details |
|---|-----|-------|---------|
| E2E-11 | **Rob described as "boyfriend" — should be "husband"** | Extraction | Script says "his wife" but extraction says "Donna's boyfriend". Character description correction needed. |
| E2E-12 | **No completion/export state after storyboard** | Post-storyboard | Project stays at `phase_status: "storyboard"` with no completion view, export, or summary. |
| E2E-13 | **No production decisions/style override system** | All phases | Locked production decisions (Bridgerton vibrant/poppy style, SoCal Suburban pool, etc.) have no way to be captured in the app. Scene 2 storyboard uses "dreamy/soft" visuals instead of the locked Bridgerton direction. Feature request for future. |

### Verification: Storyboard vs. Script Accuracy
- **Scene 1 (Bedroom, night):** 7 panels — ACCURATE. Princess phone, Dial-A-Hunk menu, pressing 4 for Kinky Corner, settling back for fantasy.
- **Scene 2 (Kitchen/Pool, day):** 7 panels — ACCURATE but wrong visual style. Jeff at pool, shirt removal, Donna at window, screen door, kitchen kiss. Should be Bridgerton vibrant/poppy per Production Decisions, not dreamy/soft.
- **Scene 3 (Bedroom, night):** 7 panels — EXCELLENT. Dimming light, undressing, intercut dream imagery, building climax, Rob silhouette in doorway with smirk (matches locked "Rob Smirk Sh.19"), "DONNA!" call-out, startled reaction + phone drop.

### Data State After E2E Test
| Table | Count | Notes |
|-------|-------|-------|
| Characters | 5 | 3 visual (all locked with real headshots), 2 voice-only |
| Scenes | 3 | Correct Ep2 data, but `location_id` all NULL |
| Locations | 3 | WRONG — Ep1 beach data, must delete + replace |
| Location Variations | 15 | WRONG — images for beach locations, must delete |
| Scene Variations | 9 | Correct — 3 per scene, 1 approved each |
| Storyboard Panels | 21 | 7 per scene, all with Gemini-generated images |
| Cast Variations | ~30+ | Mix of real headshots (approved) + AI-generated (from accidental Generate All) |

### Files Changed in This Session
- `src/app/projects/[id]/cast/page.tsx` — client-side compression + direct Supabase Storage upload
- `src/app/api/projects/[id]/cast/route.ts` — PUT handler refactored to accept JSON metadata (no file upload)

### SQL Fix Applied Manually (must be in migration)
```sql
UPDATE storage.buckets SET public = true WHERE id = 'project-uploads';
```

---

## 🔄 Next Up: Re-Extraction Cleanup Bug (discovered 2026-04-14)

After commit `1b6f349` shipped, re-ran extraction on WAYW Ep2 project (`c0ee0350-b95d-4a45-8c8d-538e3e252395`) to backfill the locations FK fix. The extraction **inserted new rows alongside the old ones instead of wiping and rebuilding** — `delete()` calls in the extract route are silently failing because of foreign-key constraints on dependent tables.

### Current DB state (mess)
| Table | Rows | Expected | Problem |
|-------|------|----------|---------|
| locations | 6 | 3 | 3 old Ep1 beach locations still present + 3 new Ep2 added alongside |
| scenes | 7 | 4 | 3 old orphaned scenes with `location_id: null` + 4 new correct scenes with FK populated |
| location_variations | ~15 | 0 | All linked to old Ep1 locations |
| storyboard_panels | 21 | 0 (re-gen needed) | All linked to old orphaned scene IDs |
| cast_variations | ~30 | (keep approved) | Linked to old character IDs |

### Root cause
- `locations.delete()` is blocked by `location_variations` FKs (15 wrong images)
- `scenes.delete()` is blocked by `storyboard_panels` FKs (21 panels)
- Supabase returns success on a no-op delete when FK constraints reject the rows, so the extract route doesn't see an error

### Fix (Claude Code end-to-end)

**1. `supabase/schema.sql` — add ON DELETE CASCADE to these FKs:**
```sql
-- location_variations.location_id → locations.id
ALTER TABLE location_variations DROP CONSTRAINT IF EXISTS location_variations_location_id_fkey;
ALTER TABLE location_variations ADD CONSTRAINT location_variations_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;

-- storyboard_panels.scene_id → scenes.id
ALTER TABLE storyboard_panels DROP CONSTRAINT IF EXISTS storyboard_panels_scene_id_fkey;
ALTER TABLE storyboard_panels ADD CONSTRAINT storyboard_panels_scene_id_fkey
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE;

-- scene_variations.scene_id → scenes.id
ALTER TABLE scene_variations DROP CONSTRAINT IF EXISTS scene_variations_scene_id_fkey;
ALTER TABLE scene_variations ADD CONSTRAINT scene_variations_scene_id_fkey
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE;

-- cast_variations.character_id → characters.id
ALTER TABLE cast_variations DROP CONSTRAINT IF EXISTS cast_variations_character_id_fkey;
ALTER TABLE cast_variations ADD CONSTRAINT cast_variations_character_id_fkey
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;

-- character_poses.character_id → characters.id
ALTER TABLE character_poses DROP CONSTRAINT IF EXISTS character_poses_character_id_fkey;
ALTER TABLE character_poses ADD CONSTRAINT character_poses_character_id_fkey
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;

-- scenes.location_id → locations.id (use SET NULL so scenes survive location re-seeding)
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_location_id_fkey;
ALTER TABLE scenes ADD CONSTRAINT scenes_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
```

**2. `src/app/api/extract/route.ts` — delete order + error surfacing:**
- On re-extract, delete in dependency order: `storyboard_panels → scene_variations → scenes → location_variations → locations → character_poses → cast_variations → characters → extractions`
- Check `error` on every `.delete()` result and throw — do not silently swallow FK rejections
- Log the row counts deleted per table so the response can include `deleted: { scenes: N, locations: M, ... }` for verification

**3. One-time cleanup SQL for the existing WAYW Ep2 project (`c0ee0350-b95d-4a45-8c8d-538e3e252395`):**

Claude Code should run this to clean up the current mess before fixing the re-extract logic (or run the cleanup SQL as part of a migration that also adds the CASCADE constraints, then tell the user to re-run extraction once more):

```sql
-- Project scope
DO $$
DECLARE
  proj_id uuid := 'c0ee0350-b95d-4a45-8c8d-538e3e252395';
BEGIN
  -- Delete storyboard panels for ALL scenes in this project (they're all stale)
  DELETE FROM storyboard_panels WHERE project_id = proj_id;

  -- Delete scene variations for ALL scenes in this project
  DELETE FROM scene_variations WHERE project_id = proj_id;

  -- Delete orphaned scenes (the old ones with location_id IS NULL)
  DELETE FROM scenes WHERE project_id = proj_id AND location_id IS NULL;

  -- Delete the old Ep1 beach locations (and their variations via CASCADE, once added)
  -- Until CASCADE is added, delete variations first:
  DELETE FROM location_variations WHERE location_id IN (
    SELECT id FROM locations
    WHERE project_id = proj_id
      AND name IN ('Beach - Exterior', 'Beach House - Kitchen/Interior', 'Beach House Kitchen - Interior')
  );
  DELETE FROM locations
  WHERE project_id = proj_id
    AND name IN ('Beach - Exterior', 'Beach House - Kitchen/Interior', 'Beach House Kitchen - Interior');
END $$;
```

After cleanup, DB should show:
- 3 locations (Donna's Bedroom, Donna's Kitchen, Donna's Kitchen/Donna's Pool)
- 4 scenes, all with `location_id` populated
- 0 storyboard panels (user must regenerate)
- 0 scene variations (user must regenerate)

### Expected outcome
- Re-extraction on any existing project becomes safely idempotent (wipes + rebuilds cleanly)
- WAYW Ep2 project ends up with the correct 4 scenes + 3 locations + proper FK linkage
- User will need to re-run scene scouting + storyboard generation after cleanup

---

### Build Log — 2026-04-14 — E2E Bug Sweep ✅ COMPLETE

Worked the E2E bug list autonomously. All twelve actionable issues (E2E-13 left as a future feature request) are fixed. Build is clean.

**CRITICAL — fixed**
- [x] **E2E-1 / E2E-2 — locations data integrity.** `src/app/api/extract/route.ts` now (1) deletes `locations` rows alongside `scenes`/`characters` on re-extraction (they don't cascade from scenes), (2) inserts unique locations FIRST and captures `id`s via `.select("id, name")`, (3) inserts scenes with `location_id` populated from a name→id map. Old verbose location names from prior runs will be replaced cleanly on re-extract.
- [x] **E2E-3 — public Storage bucket.** `supabase/schema.sql` `INSERT INTO storage.buckets … on conflict do update set public = true` so first-run and re-runs both end up public. Migration block at the bottom restated for legacy projects.

**HIGH — fixed**
- [x] **E2E-4 — Cancel buttons.** `cancelRef = useRef(false)` polled inside async generation loops with `outer:` labeled break. Cast page already had it; Storyboard page now has matching Cancel button next to "Generate All" + "Generation cancelled by user." surfaced in the error banner.
- [x] **E2E-5 — Continue to Storyboard on scene scout.** `src/app/projects/[id]/scenes/page.tsx`: footer now appears once `allApproved` (locking is optional). Copy clarifies "Locking is optional — you can proceed without it."
- [x] **E2E-6 — Generate All retries + gap detection.** `generateSceneWithRetry` does one auto-retry per scene; main loop calls `fetchData()` between scenes (so panel count + BOARDED badges update live, also covers E2E-7); after the loop a verification fetch flags any pending scenes that still have zero panels with "Did not finish: Scene N. Click Generate Panels on each to retry individually."

**MEDIUM — fixed**
- [x] **E2E-7 — live panel count.** Solved as part of E2E-6 (per-scene `fetchData()`).
- [x] **E2E-8 — pose sheet upload.** `PUT /api/projects/[id]/posesheet` accepts `{ character_id, storage_path, image_url }` (same direct-Storage pattern as cast headshots). `lock/page.tsx` adds compress-and-upload flow, hidden file input, and Upload buttons in three places: header of an existing sheet, error retry state, and empty state.
- [x] **E2E-9 — sticky Continue.** Lock page footer is now `position: fixed` at viewport bottom with backdrop blur. 24-unit spacer added so the last card never sits under it.
- [x] **E2E-10 — voice-only filtered from cast strip.** `voice_only` added to `GET /api/projects/[id]/storyboard` character select; `storyboard/page.tsx` filters `characters.filter((c) => !c.voice_only)` for the Cast Reference strip.

**LOW — fixed**
- [x] **E2E-11 — relationship precision.** `src/lib/extract.ts` system prompt has explicit RELATIONSHIP PRECISION block: use the EXACT term the script uses (husband/wife/boyfriend/girlfriend/partner). New extractions of WAYW Ep2 will now describe Rob as "husband" not "boyfriend".
- [x] **E2E-12 — completion view.** Storyboard page completion block expanded to a full celebration card: hero ("All 7 Phases Complete"), 4-column stat tiles (Scenes, Panels, Cast, Runtime), per-scene breakdown grid (clickable to jump to scene), and dual CTAs (Back to Project + Print/Export PDF via `window.print()`).

**SKIPPED / future**
- E2E-13 — production decisions/style override system. This is a feature request (capture per-project locked production direction so storyboard generation honors it), not a bug. Logged in the bug report; not part of this sweep.

**Files touched in this commit**
- `src/app/api/extract/route.ts` — locations FK, voice_only persistence (already wired), data hygiene on re-extract
- `src/app/api/projects/[id]/posesheet/route.ts` — PUT handler for uploaded reference sheets
- `src/app/api/projects/[id]/storyboard/route.ts` — `voice_only` added to character select
- `src/app/projects/[id]/lock/page.tsx` — upload flow, sticky Continue bar, dual buttons in empty/error states
- `src/app/projects/[id]/scenes/page.tsx` — Continue footer triggers on `allApproved` not `allLocked`
- `src/app/projects/[id]/storyboard/page.tsx` — Cancel button, retry-with-gap-detection generateAll, per-scene live refresh, voice-only filter, full completion view
- `src/lib/extract.ts` — RELATIONSHIP PRECISION block in extraction prompt
- `supabase/schema.sql` — bucket public on creation + restated migration

### ✅ COMPLETE: 2026-04-14 — E2E Bug Sweep

---

### Build Log — 2026-04-14 — E2E-13: Production Notes / Style Override ✅ COMPLETE

Closed out the last E2E list item. Directors can now set per-project production directives that get locked into every downstream image prompt (storyboard panels, scene scouts, location scouts).

**Schema** — `supabase/schema.sql`
- Added `alter table projects add column if not exists production_notes text not null default ''` migration block.

**Types** — `src/lib/types.ts`
- `Project.production_notes: string` added.

**API** — `src/app/api/projects/[id]/route.ts`
- Added `"production_notes"` to the PATCH `allowed` allowlist.

**UI** — `src/app/projects/[id]/page.tsx`
- New "Production Notes" card between Extraction and Phase Links. Multiline textarea, autosave on blur, manual Save button, status line ("Saving…", "Unsaved", "Saved", "Empty"). Example placeholder tells the director what kinds of directives work (aspect ratio, color grade, costume continuity).

**Prompt injection** — `src/lib/generate-image.ts`
- New `productionDirectivePrefix(notes)` helper prepends `PRODUCTION DIRECTIVE (locked — these rules override any conflicting style guidance below): {notes}` as the first line of each prompt.
- `buildLocationPrompt`, `buildSceneScoutPrompt`, `buildStoryboardPrompt` all take optional `productionNotes` and emit the prefix when non-empty. Casting/pose-sheet builders intentionally skipped (they're identity-anchored to reference images, not style plates).

**Callers** — fetch `production_notes` once per request and pass through:
- `src/app/api/projects/[id]/locations/route.ts`
- `src/app/api/projects/[id]/scenes/route.ts`
- `src/app/api/projects/[id]/storyboard/route.ts`

Build clean: `npm run build` passes with no TypeScript errors.


