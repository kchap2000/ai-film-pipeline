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

## 🔄 Next Up: Identity Reference Bug — Pose Sheets + Storyboard Panels (CRITICAL, discovered 2026-04-14)

### Symptom
Pose sheets in the Film Bible show a **completely different person** than the approved headshot. Khalil confirmed this visually after the E2E-14 fix was shipped.

### Root cause
The client-side headshot upload refactor (commit `2f6eced`) stores `cast_variations.image_url` as an **HTTPS Supabase Storage URL** (`https://onavhfhpdxwzdwotkddq.supabase.co/storage/v1/object/public/...`). But `generatePoseSheet()` and `buildStoryboardPrompt()` both have a regex that only accepts **base64 data URLs**:

```typescript
const match = referenceImageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
if (!match) {
  console.error("generatePoseSheet: invalid reference image data URL");
  return generatePlaceholder(...);   // returns SVG
}
```

### What actually happens in production
1. `POST /api/projects/:id/posesheet` passes `variation.image_url` (HTTPS) to `generatePoseSheet()`
2. Regex fails → function returns SVG placeholder
3. Route detects SVG → thinks Gemini content-policy-blocked the multimodal call → falls back to `generateWithGemini()` **text-only**
4. Text-only path produces a realistic JPEG **without the headshot as reference**
5. DB stores a real-looking pose sheet, `is_placeholder: false` — but the character identity isn't anchored to the headshot
6. User sees "pose sheet of a different person" in Film Bible

### Verification
- Triggered `POST /api/projects/c0ee0350…/posesheet` for Donna (char `29d12ca3-…`) on 2026-04-14
- Response: `success: true, is_placeholder: false` with a real JPEG
- But identity is NOT locked to Donna's uploaded headshot — matches the visual symptom exactly

### Fix (Claude Code end-to-end)

**1. `src/lib/generate-image.ts` — add URL fetching helper:**
```typescript
async function toInlineData(
  imageUrl: string
): Promise<{ mimeType: string; data: string } | null> {
  // Already a data URL — parse and return
  const dataMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (dataMatch) {
    return { mimeType: dataMatch[1], data: dataMatch[2] };
  }
  // HTTPS URL — fetch and convert to base64
  if (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        console.error(`toInlineData: fetch failed ${res.status} for ${imageUrl}`);
        return null;
      }
      const mimeType = res.headers.get("content-type") || "image/jpeg";
      const buf = await res.arrayBuffer();
      const data = Buffer.from(buf).toString("base64");
      return { mimeType, data };
    } catch (err) {
      console.error("toInlineData: fetch crashed", err);
      return null;
    }
  }
  return null;
}
```

**2. Apply this in both places that currently use the regex:**
- `generatePoseSheet()` at ~line 397
- Storyboard panel prompt builder at ~line 300 (for `sceneReferenceImageUrl`)
- Any other place that passes reference imagery to Gemini (character reference injection into storyboard panels — see below)

**3. Route-level improvement — distinguish real content-policy blocks from "regex failed" errors:**
The current fallback logic in `posesheet/route.ts` treats *any* SVG return as "Gemini blocked the content" and retries text-only. But if `toInlineData()` returns `null` (bad URL, fetch failed), the route should **error loudly** instead of silently falling back to an identity-less text-only generation. Return `{ error: "Could not load headshot for multimodal reference" }` with a 500 so the user sees the failure.

**4. After fix lands, regenerate all existing pose sheets for WAYW Ep2:**
Claude Code should add a one-shot migration or script:
```sql
UPDATE characters SET pose_sheet_url = NULL
WHERE project_id = 'c0ee0350-b95d-4a45-8c8d-538e3e252395' AND locked = true;
```
Then user re-runs "Generate Pose Sheet" per character, or a bulk "Regenerate All" button on the Lock page triggers `POST /posesheet` for each locked character in sequence.

---

## 🎯 Strategic Vision / Product Roadmap Notes (added 2026-04-14)

### Khalil's end-state vision
> "Script goes in → all the casting is done → we make the choices or put in our own casting → it has already analyzed the script → then it goes through all the phases of pose sheets, scenes, making sure we have all the information we need → once everything is OK'd, then I say okay on all the things → and then you would generate the actual realistic first frames for all of the shots so the storyboard would be actually a realistic storyboard."

### Current pipeline vs. target
| Stage | Current Behavior | Target Behavior |
|-------|------------------|-----------------|
| Script ingest | ✅ Works (PDF/DOCX/TXT) | — |
| Character/scene extraction | ✅ Works (Claude) | — |
| Film Bible | ✅ Works, editable | Add scene scout images inline (E2E-15 still open) |
| AI Casting | ✅ 10 variations OR upload real headshot | Consider: user-uploaded headshot as the canonical "cast choice"; AI variations become "suggestions" |
| Character Lock (pose sheets) | ❌ Identity leak (see bug above) | Pose sheets must be 100% faithful to uploaded/approved headshot |
| Location Scouting | ✅ 5 variations per location | — |
| Scene Scouting | ✅ 3 atmospheric images per scene | — |
| Storyboard | Generates cinematic "panel art" — stylized, not photorealistic | **Generate realistic first-frame images per shot** that serve as actual shoot-day reference |

### Recommended changes to reach the realistic-first-frame goal

**A. Add an "Approve All & Generate Frames" gate between Storyboard and Final Frames**
Right now Storyboard is the final phase. Introduce a new Phase 9: **"First Frames"** (or rename Storyboard to "Shot Breakdown" and make First Frames the new 9).
- Prerequisite: every character locked, every location approved, every scene scouted, every shot broken down
- Single "Approve Pipeline & Generate First Frames" button
- Each panel → photorealistic first frame using:
  - Approved character headshots as **identity references** (multimodal)
  - Approved location/scene scout image as **environment reference** (multimodal)
  - Shot type/angle/camera movement as prompt constraints
  - Production notes (E2E-13) as style directive

**B. Enforce identity by passing *multiple* reference images into Gemini**
The current storyboard prompt injects one scene reference image. For realistic first frames, Gemini should receive:
- 1 scene scout image (environment/color grading anchor)
- 1 image per character in the shot (identity anchor)
- The shot prompt text last
Gemini's `generateContent` accepts multiple `inlineData` parts — the order is meaningful (references before text).

**C. Storyboard → First Frame aspect ratio + resolution**
Storyboard panels are currently 1408x768 (wide). First frames for shoot reference probably want 16:9 at higher resolution (e.g., 1920x1080) and should use the production-finals model rather than the flash preview. When Gemini's higher-quality image model is available (or Imagen 4), swap it in for this phase only — keep Flash for fast iteration in earlier phases.

**D. Per-shot approval + regenerate on the First Frame phase**
Each first frame needs its own approve/regenerate cycle since identity drift is the #1 failure mode. Build in:
- Approve (lock this frame)
- Regenerate (try again with same prompt)
- Edit prompt (tweak the shot description and regenerate)
- Replace with upload (upload a real on-set reference)

**E. Pipeline state machine / phase completion gate**
Add a computed "pipeline_readiness" flag per project:
```
ready_for_first_frames =
  all characters locked AND
  all locations have approved_image_url AND
  all scenes have approved_scout_image_url AND
  all scenes have storyboard panels
```
Show a big disabled button "Generate First Frames (N/M ready)" that unlocks when ready.

**F. Store prompts alongside every generated image**
`storyboard_panels.prompt_used` already exists — extend this to cast/location/scene variations too so:
- Regeneration uses the exact same prompt
- Tweaks are traceable
- A "show full prompt" UI lets the user debug identity leaks

**G. Consider: "Casting Lock" vs. "Character Lock" semantics**
Currently "lock" means "this is the approved headshot." In a real production you may want:
- **Cast choice** (the actor/face) → headshot upload or AI pick
- **Character look** (wardrobe/styling/hair) → which may change across scenes or episodes
Separating these two concepts allows per-scene wardrobe variations while keeping identity constant.

### Immediate action items (in priority order)
1. **Fix the pose sheet HTTPS/data-URL bug above** — this is the blocker Khalil is hitting right now
2. **Complete E2E-15** (scene scout images in Film Bible)
3. **Regenerate pose sheets for WAYW Ep2** after the fix
4. **Decide on Phase 9: First Frames** and scope it out — the current "storyboard panel" output isn't the final deliverable Khalil wants
5. **Multimodal identity injection into storyboard/first-frame generation** — pass all in-shot character headshots as references, not just the scene scout
6. **Pipeline readiness gate** — computed boolean + UI gating

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

### Build Log — 2026-04-15 — Identity-reference fix + E2E-15 + pose-sheet regen tool ✅ COMPLETE

Closed out the immediate action items from the 2026-04-14 roadmap section above.

**1. HTTPS / data-URL regression — fixed** (`src/lib/generate-image.ts`)
- New exported helper `toInlineData(url)` accepts both base64 data URLs and HTTPS/HTTP URLs. For HTTPS it fetches, grabs `content-type`, and base64-encodes. Returns `null` on any failure so callers can distinguish "couldn't load" from "Gemini blocked it".
- New `ReferenceImageUnreachableError` class so `generatePoseSheet` throws a typed error when the reference can't be resolved (instead of silently returning an SVG placeholder, which the posesheet route misread as a content-policy block → text-only retry → identity-less pose sheet).
- `generatePoseSheet()` rewritten to use `toInlineData()`. Param renamed `referenceImageDataUrl` → `referenceImageUrl` to reflect that HTTPS is now accepted.
- `generateStoryboardPanel()` multimodal branch also uses `toInlineData()` so approved scene-scout references survive the HTTPS migration.

**2. Route-level loud failure** (`src/app/api/projects/[id]/posesheet/route.ts`)
- POST now catches `ReferenceImageUnreachableError` and returns HTTP 502 with a descriptive error instead of falling through to text-only retry. This guarantees we never store a pose sheet produced without the headshot as an identity anchor.

**3. E2E-15 — scene scout images in Film Bible ✅ COMPLETE**
- `GET /api/projects/:id/bible` now returns a 6th parallel query for `scenes` filtered on `approved_scout_image_url IS NOT NULL`, selecting only `id`. That set is mapped into `has_approved_scout_image: boolean` per scene in the response. No base64 in the bulk payload — complies with the "no images in bulk GETs" rule.
- `src/app/projects/[id]/bible/page.tsx`:
  - New `SceneWithScout` type extending `Scene` with `has_approved_scout_image`.
  - New `useEffect` loops scenes and lazy-loads each approved scout via the existing `GET /api/projects/:id/scenes/image?scene_id=xxx&type=approved` endpoint.
  - `fetchBibleImage` helper extended to read `data.approved_scout_image_url` as a valid image key.
  - Each scene card now renders a 192px-tall approved-scout thumbnail at the top of its body (with a loading placeholder while the image resolves).

**4. "Regenerate All Pose Sheets" bulk action** (`src/app/projects/[id]/lock/page.tsx`)
- Header now shows a second button next to "Lock All" (or solo if everyone is already locked). Sequentially drops the cached pose sheet + calls `triggerPoseSheet(char.id)` for every character with an approved headshot. Progress counter in the button label (`Regenerating 3/7...`). Used to clean up identity-leaked sheets produced before the fix above landed.
- Khalil can run this once on WAYW Ep2 and the sheets will be regenerated against the correct HTTPS headshots via the fixed multimodal path — no manual SQL needed.

**Files touched in this commit**
- `src/lib/generate-image.ts`
- `src/app/api/projects/[id]/posesheet/route.ts`
- `src/app/api/projects/[id]/bible/route.ts`
- `src/app/projects/[id]/bible/page.tsx`
- `src/app/projects/[id]/lock/page.tsx`
- `PROGRESS.md`

Build clean: `npm run build` passes with no TypeScript errors.

---

### Verification run — 2026-04-16 — Pose sheet fix confirmed in production ✅

Live POST calls against `https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app/api/projects/c0ee0350-b95d-4a45-8c8d-538e3e252395/posesheet` for all three locked WAYW Ep2 characters:

| Character | HTTP | is_placeholder | Output | Wall time |
|---|---|---|---|---|
| Donna | 200 | false | 840 KB JPEG (C2PA-signed) | 21.7s |
| Jeff  | 200 | false | 823 KB JPEG | 24.3s |
| Rob   | 200 | false | 857 KB JPEG | 20.0s |

No `ReferenceImageUnreachableError`, no SVG fallback, no text-only retry. Postgres logs clean (only my own probing query errors from `information_schema` exploration). The HTTPS headshot URLs on `cast_variations.image_url` were fetched by `toInlineData()`, base64-encoded, and passed to Gemini as multimodal reference input — exactly the path the fix was designed for. Visual identity match to be confirmed by Khalil via `/projects/c0ee0350-b95d-4a45-8c8d-538e3e252395/bible`.

WAYW Ep2 state after verification:
- Characters: 3 visible locked (Donna, Jeff, Rob) + 2 voice-only. 3/3 real pose sheets, 0 SVG placeholders.
- Locations: 3 correct Ep2 locations linked to scenes via `location_id` FK. 0 approved images → phase 6 needs regen.
- Scenes: 4 scenes (re-extraction split the fantasy sequence into kitchen/pool + kitchen). 0 approved scout images → phase 7 needs regen.
- Storyboard panels: 0 → phase 8 needs regen once phases 6 and 7 are approved.

---

## 🔄 Next Up: Backport multimodal identity refs into Storyboard (Phase 7)

Phase 9 now multimodal-references the scene scout + every in-shot character headshot, so first-frame identity is locked. Phase 7 (Storyboard panels) still only references the scene scout — character identity is prompt-text-only, which is why panel art sometimes drifts from the cast.

**Scope**
- In `src/app/api/projects/[id]/storyboard/route.ts`, mirror the character-headshot lookup pattern used in `first-frames/route.ts` (already built): fetch approved headshot URL per name, assemble `characterReferences: {name, imageUrl}[]`.
- Extend `generateStoryboardPanel()` in `src/lib/generate-image.ts` to accept `characterReferences` (same shape as `generateFirstFrame()`). Merge into the multimodal parts array: scene scout first → per-character identity refs → prompt text. Use `toInlineData()` — already shipped.
- On `ReferenceImageUnreachableError`, fall back to text-only + log (don't error-out the whole batch like first-frames does — storyboard panels are faster-to-regen and already have a retry loop).

**Files**
- `src/lib/generate-image.ts` — `generateStoryboardPanel()` sig + impl
- `src/app/api/projects/[id]/storyboard/route.ts` — fetch cast headshots, pass to generator
- `PROGRESS.md` — build log + mark complete

This closes roadmap action-item #5 ("Multimodal identity injection into storyboard / first-frame generation").

---

## ✅ COMPLETE: Phase 9 — First Frames (2026-04-15)

Built the entire Phase 9 pipeline end-to-end. Commit below.

**Schema** (`supabase/schema.sql`)
- New enum value `first_frames` on `phase_status` (idempotent via exception handler so re-running the schema is safe).
- New `first_frames` table: `id`, `project_id`, `panel_id`, `image_url`, `prompt_used`, `model_used`, `aspect_ratio`, `status` (pending/approved/replaced), `parent_frame_id` (for regen lineage).
- Added `approved_first_frame_id` FK on `storyboard_panels`.

**Types** (`src/lib/types.ts`)
- `PhaseStatus`, `PHASE_ORDER`, `PHASE_LABELS` all extended with `first_frames`.

**Generation** (`src/lib/generate-image.ts`)
- New `generateFirstFrame()` function builds a parts array in this exact order: scene scout reference → one identity-reference block per character (text label + inline image) → prompt text last. Gemini weights earlier parts more heavily so identity is locked by construction.
- Uses `toInlineData()` for every ref (shipped yesterday). Throws `ReferenceImageUnreachableError` if ANY reference fails to resolve — silent dropping is the #1 identity-leak failure mode, so the loop refuses to proceed.
- Prompt explicitly instructs "photorealistic first frame, NOT a storyboard illustration" to distinguish from the Phase 7 panel output.

**Readiness endpoint** (`src/app/api/projects/[id]/readiness/route.ts`)
- `GET /api/projects/:id/readiness` returns `{ ready_for_first_frames: boolean, total_panels, checks }` where `checks` is the 4-tuple: characters locked (excluding voice-only), locations approved, scenes scouted, scenes with panels. UI uses this to gate + label the Generate button.

**First Frames API** (`src/app/api/projects/[id]/first-frames/route.ts`)
- `GET` — metadata-only (no base64 in bulk), frames grouped by panel.
- `POST` — generate. `{ panel_id }` for single; no body = bulk for every panel without an approved frame. Sequential; 300s maxDuration. Per panel: fetches scene + approved scout + per-character approved headshot URLs, assembles `characterReferences`, calls `generateFirstFrame()`, inserts the result. On bulk success, advances `phase_status` to `first_frames`.
- `PATCH` — `{ frame_id, status: "approved" }` → flips prior approved to `replaced`, marks this row `approved`, stamps `storyboard_panels.approved_first_frame_id`.
- `PUT` — user-uploaded replacement. Same direct-Storage pattern as cast/posesheet uploads.
- `src/app/api/projects/[id]/first-frames/image/route.ts` — lazy-load image bytes by `frame_id`.

**UI page** (`src/app/projects/[id]/first-frames/page.tsx`)
- Readiness banner when not ready, listing the 4 checks with done/total counts.
- Grid of panels (2-up on md+). Each card: aspect-video thumbnail, Panel NN + approved badge, action description + shot metadata, action buttons (Approve · Regenerate · Upload Replace). Lazy-loads approved/latest frame via the `/image` endpoint.
- Generate-all button with inline progress counter + Cancel.
- Sequential bulk gen with `fetchAll()` between panels so thumbnails appear live.
- Completion celebration when every panel has an approved frame.

**Nav + indicator wiring**
- `ProjectNav`: appended First Frames as phase 8 (unlocks after storyboard).
- `PhaseIndicator`: "complete" gradient now fires on `first_frames`, not `storyboard`.
- Project overview page: added First Frames tile + extended the "Next Up" logic.
- Storyboard completion view: added "Continue to First Frames" CTA next to Print / Export PDF.

Build clean: `npm run build` passes with no TypeScript errors.

**Schema migration note for Khalil**
Run this block once in Supabase SQL Editor to apply the Phase 9 migration to the existing database (or just re-run the full schema.sql — it's idempotent):
```sql
do $$ begin
  alter type phase_status add value 'first_frames';
exception when duplicate_object then null; end $$;

create table if not exists first_frames (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  panel_id uuid not null references storyboard_panels(id) on delete cascade,
  image_url text not null,
  prompt_used text not null,
  model_used text not null default 'gemini-3.1-flash-image-preview',
  aspect_ratio text not null default '16:9',
  status text not null default 'pending',
  parent_frame_id uuid references first_frames(id) on delete set null,
  created_at timestamp with time zone default now()
);
create index if not exists idx_first_frames_project on first_frames(project_id);
create index if not exists idx_first_frames_panel on first_frames(panel_id);
create index if not exists idx_first_frames_status on first_frames(status);
alter table storyboard_panels
  add column if not exists approved_first_frame_id uuid
  references first_frames(id) on delete set null;
```

---

## Scoping Reference: Phase 9 — First Frames (scoped 2026-04-15, shipped same day)

### Why this phase exists
Khalil's stated end state (PROGRESS.md lines 695-697) is **photorealistic first-frame images per shot** that serve as shoot-day reference — not the stylized "storyboard panel" art the current Storyboard phase produces. That requirement is structurally different enough from Storyboard that it warrants its own phase with its own gating, UI, and generation path. This spec converts the "A/B/C/D/E/F/G" brainstorm at lines 710-761 into a concrete buildable plan.

### Phase model
Keep current phase 8 (**Storyboard**) as-is — it stays the "shot breakdown" phase: Claude splits each scene into shots, Gemini Flash renders a stylized panel for each shot so Khalil can verify the breakdown is structurally correct. Add a new phase 9 (**First Frames**) gated behind storyboard completion.

### Schema changes
```sql
-- New phase token in the enum
alter type phase_status_enum add value if not exists 'first_frames';
-- Actually: Postgres doesn't allow if-not-exists on enum values pre-14. Use:
-- do $$ begin
--   alter type phase_status_enum add value 'first_frames';
-- exception when duplicate_object then null; end $$;

-- First frame per storyboard panel. Separate table so panels stay cheap to
-- query and we can regenerate frames without touching the panel record.
create table if not exists first_frames (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  panel_id uuid not null references storyboard_panels(id) on delete cascade,
  image_url text not null,                -- data URL or HTTPS Storage URL
  prompt_used text not null,
  model_used text not null default 'gemini-3.1-flash-image-preview',
  aspect_ratio text not null default '16:9',
  status text not null default 'pending', -- pending, approved, replaced
  parent_frame_id uuid references first_frames(id) on delete set null, -- regen lineage
  created_at timestamp with time zone default now()
);
create index if not exists idx_first_frames_project on first_frames(project_id);
create index if not exists idx_first_frames_panel on first_frames(panel_id);

-- On the panel side, store which first_frame is the chosen one
alter table storyboard_panels add column if not exists approved_first_frame_id uuid references first_frames(id) on delete set null;
```

### API routes (new)
- `POST /api/projects/:id/first-frames` — bulk generate frames for all panels (or one panel when `{ panel_id }` body). 300s maxDuration. Iterates panels sequentially; per panel assembles multimodal input of [scene-scout ref, one headshot per character-in-shot, prompt text] and calls Gemini. Returns summary `{ framesGenerated, errors[] }`.
- `POST /api/projects/:id/first-frames/regenerate` — `{ panel_id }` → generate a new frame row with `parent_frame_id` set to the previous approved one.
- `PATCH /api/projects/:id/first-frames` — `{ frame_id, status: "approved" }` flips the row and stamps `storyboard_panels.approved_first_frame_id`.
- `GET /api/projects/:id/first-frames` — bulk list, NO base64 (select `id, panel_id, status, created_at` only). Image bytes via dedicated `/image` endpoint.
- `GET /api/projects/:id/first-frames/image?frame_id=xxx` — lazy load, returns `{ image_url }`.

### Generation logic (`src/lib/generate-image.ts`)
New `generateFirstFrame(opts)` function that accepts up to N reference images and produces a photorealistic frame:
```typescript
export async function generateFirstFrame(opts: {
  panelNumber: number;
  actionDescription: string;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  characterReferences: { name: string; imageUrl: string }[]; // HTTPS or data URL
  sceneReferenceImageUrl?: string | null;                    // approved scout
  locationName: string;
  timeOfDay: string;
  mood: string;
  productionNotes?: string;
  aspectRatio?: '16:9' | '2.39:1';
}): Promise<GeneratedImage>
```
Implementation notes:
- Use `toInlineData()` (shipped today) for every reference — no more regex gating.
- Parts order matters: scene ref first (environment anchor), then each character ref (identity anchors, labeled with a text preamble `Reference for {name}:`), then the shot prompt text last. Gemini weights earlier parts more heavily.
- Prompt text should explicitly instruct "photorealistic first-frame image, not a stylized storyboard panel".
- If any character ref fails to load, error loudly (same pattern as `ReferenceImageUnreachableError`) — do NOT silently drop references; identity leak is the #1 failure mode.
- Use Gemini's higher-quality image model when available; leave `model_used` stored on the row so we can A/B later.

### Pipeline readiness gate
Before exposing the "Generate First Frames" button, compute:
```typescript
ready_for_first_frames =
  every cast character is locked AND
  every location has approved_image_url AND
  every scene has approved_scout_image_url AND
  every scene has at least one storyboard_panel
```
Query the above with counts in a single derived endpoint (`GET /api/projects/:id/readiness`) so the storyboard page can show `Generate First Frames (N/M ready)` with a tooltip listing what's missing.

### UI — new `/projects/[id]/first-frames` page
- Mirrors the storyboard page layout but each row shows: the shot breakdown metadata + the generated first frame thumbnail (lazy-loaded).
- Per-frame actions: Approve · Regenerate · Edit Prompt (opens a textarea, then regen with edited prompt) · Replace with Upload (direct Storage + PUT, same pattern as headshot/pose-sheet upload).
- Cancel button + sequential generation loop with `fetchData()` between frames (same pattern as storyboard Generate All, carrying over the E2E-6 retry + gap-detection logic).
- Completion view: "Pipeline Complete — First Frames Ready" hero + per-scene grid linking to each frame + Export PDF CTA.

### Phase transition
- `POST /api/projects/:id/storyboard` already sets `phase_status = "storyboard"`.
- Add `POST /api/projects/:id/first-frames` (bulk) to set `phase_status = "first_frames"` on success.
- Dashboard/ProjectNav/PhaseIndicator need the `first_frames` token added to `PHASE_ORDER` and `PHASE_LABELS` in `src/lib/types.ts`.

### What's deferred
- **"Casting Lock vs Character Look" split** (PROGRESS.md G) — not blocking Phase 9; can ship later as a per-scene wardrobe override.
- **Higher-res model swap** — depends on Gemini/Imagen availability; the `model_used` column makes this a no-migration change later.
- **Per-frame print layout tuning** — deliver baseline PDF export first, iterate on layout after Khalil uses it on WAYW Ep2.

### Immediate next step when Phase 9 kicks off
Start with the schema + types + readiness endpoint. Once readiness is computable, the UI gating is trivial and the generation route can be built and tested end-to-end on a single scene before batching.

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

---

## 🔧 NEW BUGS — discovered 2026-04-18 during WAYW Ep2 review

### BUG-16: Location Descriptions Are Empty / Synthetic — No Script Detail (MEDIUM-HIGH)

**Phase:** Extraction → Location Scouting
**Symptom:** Location scouting images are generic because the `locations.description` field contains only `"Location Name — time_of_day"` (e.g., "Khalil's Apartment — night"). No physical details from the script.

**Root cause:** In `src/app/api/extract/route.ts` (lines ~175-182), location descriptions are algorithmically constructed:
```
description: `${firstCased[key] || key} — ${locationMeta[key].time_of_day}`
```
The extraction prompt in `src/lib/extract.ts` asks Claude to extract location names but does NOT ask for physical descriptions of the space. Script prose like "cramped studio with exposed brick" or "modern kitchen with marble countertops" is never captured.

**Fix (Claude Code end-to-end):**
1. Update the extraction prompt in `src/lib/extract.ts` to ask Claude to include a `location_description` field for each unique location — a 1-2 sentence physical description derived from the script's scene headings and action lines.
2. Update `src/app/api/extract/route.ts` to store the LLM-extracted description in `locations.description` instead of the synthetic `"Name — time"` string.
3. Pass `locations.description` into the location scouting image generation prompt (verify `buildLocationPrompt` in `generate-image.ts` already uses it — if so, richer descriptions will automatically produce better images).
4. For existing projects (Life of the Lazy Mon, WAYW Ep2): offer a one-time re-extraction or allow manual editing of location descriptions in the UI.

---

### BUG-17: Storyboard Panels Don't Use Character Headshots as Visual Reference (HIGH)

**Phase:** Storyboard (Phase 8)
**Symptom:** Storyboard panel images show generic/inconsistent character faces because Gemini only receives text descriptions of characters, not their approved headshot images. Each panel is Gemini's fresh interpretation of "Donna, mid-40s, wearing sweatpants" rather than a likeness-anchored render.

**Root cause:** In `src/app/api/projects/[id]/storyboard/route.ts`, the code queries `cast_variations` and maps them to characters (lines ~37-46) but only for UI display — the `approved_variation_id` is returned so the frontend can lazy-load headshots in the cast reference strip. The headshot images are **never fetched or passed** to `generateStoryboardPanel()` in `src/lib/generate-image.ts`.

`generateStoryboardPanel()` accepts an optional `sceneReferenceImageUrl` (the approved scene scout) as a single multimodal reference, but has no parameter for character reference images.

**Fix (Claude Code end-to-end):**
1. **`src/lib/generate-image.ts` — `generateStoryboardPanel()`:**
   - Add a new parameter: `characterReferences?: Array<{ name: string; imageUrl: string }>`.
   - For each character reference, use `toInlineData()` (already built for the pose sheet fix) to fetch the headshot and include it as an `inlineData` part in the Gemini request.
   - Prepend each character image part with a text part: `"Reference image for character {name} — maintain exact likeness in the panel:"`.
   - Order: character reference images first, then scene scout reference (if any), then the text prompt. This follows Gemini's multimodal best practice of references-before-prompt.

2. **`src/app/api/projects/[id]/storyboard/route.ts`:**
   - Already queries `cast_variations` for approved headshots. Currently only maps to `approved_variation_id`.
   - After the existing query, build a `characterReferences` array: for each character present in the current shot, look up `characters.approved_cast_id` → `cast_variations.image_url`.
   - Pass `characterReferences` into `generateStoryboardPanel()`.
   - Skip `voice_only` characters (they have no headshot and shouldn't appear in panels).

3. **Prompt update in `generateStoryboardPanel()`:**
   - When character references are provided, add to the text prompt: `"CRITICAL: The characters in this shot must match the reference images provided above. Maintain exact facial likeness, hairstyle, and proportions for each character."`

4. **Performance consideration:**
   - Each headshot is ~100-400KB as base64. A panel with 2-3 characters + a scene scout = ~1-2MB of reference images per Gemini call. This is within Gemini's multimodal limits but will increase latency by ~2-5s per panel.
   - The `toInlineData()` calls should be parallelized with `Promise.all()` before the Gemini call to avoid serial fetch overhead.

**Impact:** This fix will dramatically improve character consistency across storyboard panels — the same improvement we got from fixing pose sheets. It also directly feeds Phase 9 First Frames, which will use the same multi-reference pattern but at higher fidelity.

---

### Priority order for Claude Code:
1. **BUG-17** (storyboard character headshots) — HIGH, directly visible quality improvement
2. **BUG-16** (location descriptions from script) — MEDIUM-HIGH, improves location scouting quality
3. **Phase 9 First Frames** — next major feature, gated behind phases 6-8 completion

---

## 🔄 NEXT UP: "Project Brain" — Single Source of Truth Architecture (scoped 2026-04-18)

### What this is and why it matters

Every project needs a **single source of truth** — a "brain" — where all canonical assets live, and every downstream generated image traces back to those sources. Right now each phase generates independently. If you change a character's headshot, nothing downstream knows. Pose sheets still show the old face, storyboard panels still show the old face, first frames (when built) would still show the old face. The pipeline produces artifacts that silently become inconsistent.

The Project Brain fixes this by introducing **provenance tracking** (every generated asset records what it was built from), **staleness detection** (when a source changes, all derived assets are flagged), and **cascade regeneration** (one button to re-derive everything that's out of date, in the correct order).

This is NOT a separate feature bolted on top — it restructures how every generation call works. BUG-16, BUG-17, and Phase 9 First Frames are all subsumed into this plan. Claude Code should read this entire section, analyze the existing codebase for gaps, and build everything end-to-end.

---

### PART 1: The Dependency Graph

Every generated asset in the pipeline is derived from one or more source assets. Here is the complete dependency tree:

```
CANONICAL SOURCES (user-controlled):
├── Script text (uploaded PDF/DOCX/TXT)
├── Production Notes (text, per-project)
├── Character Headshots (approved cast_variation per character)
└── (future: per-scene wardrobe overrides)

DERIVED ASSETS (AI-generated, each traces to its sources):
│
├── Extraction (scenes, characters, locations)
│   └── derived from: script text
│
├── Character Pose Sheet
│   └── derived from: character headshot + character description + script wardrobe
│
├── Location Scout Images (5 per location)
│   └── derived from: location description + production notes
│
├── Scene Scout Images (3 per scene → 1 approved)
│   └── derived from: location scout (approved) + scene metadata + production notes
│
├── Storyboard Panels (N per scene)
│   └── derived from: scene scout (approved) + character headshots (per in-shot character) + shot breakdown + production notes
│
└── First Frames (1 per panel, Phase 9)
    └── derived from: scene scout (approved) + character headshots (per in-shot character) + pose sheet (optional style ref) + panel shot data + production notes
```

**Key insight:** Character headshots fan out into pose sheets, storyboard panels, AND first frames. Changing one headshot can invalidate dozens of downstream assets. The system must track this.

---

### PART 2: Schema Changes

#### 2A. Version tracking on source assets

Add a `version` counter to every table that holds a canonical approved asset. The version bumps any time the approved asset changes.

```sql
-- Characters: version bumps when approved_cast_id changes (new headshot) or description changes
ALTER TABLE characters ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Locations: version bumps when approved_image_url changes or description changes
ALTER TABLE locations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Scenes: version bumps when approved_scout_image_url changes
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Projects: version bumps when production_notes changes
ALTER TABLE projects ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
```

#### 2B. Provenance tracking table

A single junction table that records every source→derived relationship at generation time:

```sql
CREATE TABLE IF NOT EXISTS asset_provenance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- The derived asset
  asset_type text NOT NULL,  -- 'pose_sheet', 'location_variation', 'scene_variation', 'storyboard_panel', 'first_frame'
  asset_id uuid NOT NULL,    -- FK to the specific row (character.id for pose_sheet, panel.id for storyboard, etc.)
  -- The source it was derived from
  source_type text NOT NULL, -- 'character_headshot', 'character_description', 'location_description', 'scene_scout', 'location_scout', 'production_notes'
  source_id uuid NOT NULL,   -- FK to the source row (character.id, location.id, scene.id, project.id)
  source_version integer NOT NULL, -- the version of the source at generation time
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provenance_asset ON asset_provenance(asset_type, asset_id);
CREATE INDEX IF NOT EXISTS idx_provenance_source ON asset_provenance(source_type, source_id);
```

#### 2C. First Frames table (Phase 9 — already scoped above, unchanged)

Keep the `first_frames` table from the Phase 9 spec. It participates in provenance like any other derived asset.

---

### PART 3: Provenance Recording — How to Wire It

Every generation function must record provenance AFTER successful generation. Create a reusable helper:

```typescript
// src/lib/provenance.ts

interface ProvenanceEntry {
  source_type: string;
  source_id: string;
  source_version: number;
}

export async function recordProvenance(
  supabase: SupabaseClient,
  assetType: string,
  assetId: string,
  sources: ProvenanceEntry[]
): Promise<void> {
  // Delete old provenance for this asset (it's being regenerated)
  await supabase.from('asset_provenance').delete()
    .eq('asset_type', assetType).eq('asset_id', assetId);

  // Insert new provenance rows
  const rows = sources.map(s => ({
    asset_type: assetType,
    asset_id: assetId,
    source_type: s.source_type,
    source_id: s.source_id,
    source_version: s.source_version,
  }));
  await supabase.from('asset_provenance').insert(rows);
}
```

**Where to call it (every generation route):**

| Generation route | Asset type | Sources to record |
|---|---|---|
| `POST /api/projects/:id/posesheet` | `pose_sheet` | `character_headshot` (character.id, character.version) |
| `POST /api/projects/:id/locations` (generate) | `location_variation` | `location_description` (location.id, location.version), `production_notes` (project.id, project.version) |
| `POST /api/projects/:id/scenes` (generate scout) | `scene_variation` | `scene_scout` (scene.id, scene.version), `location_scout` (location.id, location.version), `production_notes` (project.id, project.version) |
| `POST /api/projects/:id/storyboard` | `storyboard_panel` | `scene_scout` (scene.id, scene.version), `character_headshot` (one per in-shot character), `production_notes` (project.id, project.version) |
| `POST /api/projects/:id/first-frames` | `first_frame` | `scene_scout` (scene.id, scene.version), `character_headshot` (one per in-shot character), `production_notes` (project.id, project.version) |

---

### PART 4: Version Bumping — When Sources Change

Create a helper or use Supabase triggers to bump versions when canonical assets change:

```typescript
// src/lib/provenance.ts

export async function bumpVersion(
  supabase: SupabaseClient,
  table: 'characters' | 'locations' | 'scenes' | 'projects',
  id: string
): Promise<number> {
  const { data } = await supabase.from(table)
    .select('version')
    .eq('id', id)
    .single();
  const newVersion = (data?.version ?? 0) + 1;
  await supabase.from(table)
    .update({ version: newVersion })
    .eq('id', id);
  return newVersion;
}
```

**Where to call it:**

| User action | Bump what |
|---|---|
| Approve a new headshot (PATCH cast → `approved_cast_id` changes) | `bumpVersion('characters', characterId)` |
| Upload/replace headshot | `bumpVersion('characters', characterId)` |
| Edit character description (bible inline edit) | `bumpVersion('characters', characterId)` |
| Approve a new location scout image | `bumpVersion('locations', locationId)` |
| Edit location description | `bumpVersion('locations', locationId)` |
| Approve a new scene scout image | `bumpVersion('scenes', sceneId)` |
| Save production notes (PATCH project) | `bumpVersion('projects', projectId)` |

---

### PART 5: Staleness Detection

A derived asset is **stale** when any of its recorded source versions are older than the source's current version. Single query to get all stale assets for a project:

```sql
SELECT
  ap.asset_type,
  ap.asset_id,
  ap.source_type,
  ap.source_id,
  ap.source_version AS generated_with_version,
  CASE ap.source_type
    WHEN 'character_headshot' THEN c.version
    WHEN 'character_description' THEN c.version
    WHEN 'location_description' THEN l.version
    WHEN 'scene_scout' THEN s.version
    WHEN 'location_scout' THEN l.version
    WHEN 'production_notes' THEN p.version
  END AS current_version
FROM asset_provenance ap
LEFT JOIN characters c ON c.id = ap.source_id AND ap.source_type IN ('character_headshot', 'character_description')
LEFT JOIN locations l ON l.id = ap.source_id AND ap.source_type IN ('location_description', 'location_scout')
LEFT JOIN scenes s ON s.id = ap.source_id AND ap.source_type = 'scene_scout'
LEFT JOIN projects p ON p.id = ap.source_id AND ap.source_type = 'production_notes'
WHERE p.id = $projectId OR c.project_id = $projectId OR l.project_id = $projectId OR s.project_id = $projectId
HAVING ap.source_version < CASE ap.source_type ... END;
```

**API endpoint:** `GET /api/projects/:id/staleness`

Returns:
```json
{
  "stale_assets": [
    {
      "asset_type": "storyboard_panel",
      "asset_id": "abc-123",
      "stale_because": [
        { "source_type": "character_headshot", "source_name": "Donna", "generated_v": 1, "current_v": 2 }
      ]
    }
  ],
  "summary": {
    "pose_sheets": { "total": 3, "stale": 1 },
    "storyboard_panels": { "total": 21, "stale": 14 },
    "first_frames": { "total": 0, "stale": 0 },
    "location_variations": { "total": 15, "stale": 0 },
    "scene_variations": { "total": 9, "stale": 3 }
  }
}
```

---

### PART 6: Cascade Regeneration Engine

When a user clicks "Regenerate Stale Assets" or when a source changes and the user confirms cascade:

```typescript
// src/lib/cascade.ts

// Regeneration must follow dependency order:
// 1. Pose sheets (depends only on headshots)
// 2. Location variations (depends on location descriptions + production notes)
// 3. Scene variations (depends on location scouts + scene metadata + production notes)
// 4. Storyboard panels (depends on scene scouts + character headshots + production notes)
// 5. First frames (depends on scene scouts + character headshots + production notes)

export const REGEN_ORDER = [
  'pose_sheet',
  'location_variation',
  'scene_variation',
  'storyboard_panel',
  'first_frame',
] as const;
```

**API endpoint:** `POST /api/projects/:id/cascade-regenerate`

Body: `{ asset_types?: string[] }` — optional filter; omit to regen all stale assets.

Logic:
1. Call `/staleness` to get all stale assets.
2. Group by `asset_type`.
3. For each type in `REGEN_ORDER`, if there are stale assets of that type:
   a. Call the existing generation endpoint for each asset.
   b. Record new provenance with current source versions.
   c. Return progress: `{ completed: ['pose_sheet'], in_progress: 'storyboard_panel', remaining: ['first_frame'] }`.
4. If a type has no stale assets, skip it.
5. Return a summary of what was regenerated.

**Frontend integration:**
- Every page that shows generated assets should call `/staleness` on mount.
- Stale assets get a yellow warning badge: "⚠ Generated with outdated Donna headshot (v1 → v2)".
- A floating action button appears when any stale assets exist: "Regenerate N stale assets".
- Clicking it shows a confirmation dialog listing what will be regenerated and the estimated time.
- Progress indicator during regeneration (WebSocket or polling).

---

### PART 7: UI — Staleness Badges + Cascade Controls

#### 7A. Staleness badge component

```typescript
// src/components/StaleBadge.tsx
// Renders a yellow "⚠ Outdated" pill with a tooltip showing which source changed.
// Props: staleReasons: Array<{ source_type, source_name, generated_v, current_v }>
// If empty/null, renders nothing (asset is fresh).
```

#### 7B. Per-page integration

| Page | What to badge | Action |
|---|---|---|
| Film Bible | Character cards with stale pose sheets | "Regenerate Pose Sheet" per card |
| Character Lock | Pose sheet thumbnails | "Regenerate" button per character + "Regenerate All Stale" bulk |
| Location Scouting | Stale location variation images | "Regenerate" per location |
| Scene Scouting | Stale scene scout images | "Regenerate" per scene |
| Storyboard | Stale panels | "Regenerate Panel" per panel + "Regenerate All Stale" bulk |
| First Frames | Stale frames | Same pattern |

#### 7C. Project overview page

Add a "Project Health" card to the project page showing:
- Total assets: N | Fresh: M | Stale: K
- If K > 0: "Regenerate All Stale Assets" button with estimated time
- If K == 0: green "✓ All assets current" badge

---

### PART 8: Fixes That Ship With This (BUG-16 + BUG-17)

This architecture subsumes both outstanding bugs:

**BUG-16 (location descriptions):** Part of the Project Brain because richer location descriptions are a canonical source that flows into location scout → scene scout → storyboard → first frames. Fix the extraction prompt to pull physical details from the script. The new `version` system means re-extracting a project bumps location versions and correctly flags downstream scouts as stale.

**BUG-17 (character headshots in storyboard):** Part of the Project Brain because the storyboard generation route needs to pull character headshots as multimodal references AND record provenance for each one. The `characterReferences` parameter on `generateStoryboardPanel()` is required infrastructure for both the staleness system (we need to know which headshots went in) and visual quality (consistent characters).

**Both must be implemented as part of this plan, not separately.**

---

### PART 9: Implementation Order for Claude Code

Build in this sequence. Each step should compile (`npm run build`) and be committed before moving to the next. Run the full codebase gap analysis first.

**Step 0 — GAP ANALYSIS (do this first, before writing any code)**

Read every file listed below and identify anything in the existing code that conflicts with or is missing from this plan. Look for:
- Hardcoded generation calls that don't record provenance
- API routes that modify canonical assets (headshot approval, scout approval, description edits, production notes save) but don't bump versions
- Places where `cast_variations.image_url` is queried but not passed to image generation
- The extraction prompt in `src/lib/extract.ts` — what does it ask for regarding locations? What's missing?
- `generate-image.ts` — which functions accept multimodal references and which don't? What's the gap?
- Every PATCH/PUT route — which ones modify canonical sources and would need version bumps?
- Any bulk query that would need to join `asset_provenance` for staleness info

Files to audit:
```
src/lib/extract.ts
src/lib/generate-image.ts
src/lib/types.ts
src/app/api/projects/[id]/route.ts
src/app/api/projects/[id]/cast/route.ts
src/app/api/projects/[id]/posesheet/route.ts
src/app/api/projects/[id]/locations/route.ts
src/app/api/projects/[id]/scenes/route.ts
src/app/api/projects/[id]/storyboard/route.ts
src/app/api/projects/[id]/bible/route.ts
src/app/projects/[id]/page.tsx
src/app/projects/[id]/cast/page.tsx
src/app/projects/[id]/lock/page.tsx
src/app/projects/[id]/locations/page.tsx
src/app/projects/[id]/scenes/page.tsx
src/app/projects/[id]/storyboard/page.tsx
src/app/projects/[id]/bible/page.tsx
supabase/schema.sql
```

Write findings to the build log. Then proceed with implementation:

**Step 1 — Schema + Types + Provenance Helper**
- Add `version` columns to characters, locations, scenes, projects
- Create `asset_provenance` table
- Create `first_frames` table
- Update `src/lib/types.ts` with new types
- Create `src/lib/provenance.ts` with `recordProvenance()` and `bumpVersion()`
- Run migration on Supabase

**Step 2 — Version Bumping on All Mutation Routes**
- Wire `bumpVersion()` into every API route that modifies a canonical source asset
- Test: PATCH a character description → version should increment

**Step 3 — BUG-16: Extraction Prompt + Location Descriptions**
- Update extraction prompt to include physical location descriptions
- Update extraction route to store LLM descriptions
- Verify `buildLocationPrompt` uses the description field

**Step 4 — BUG-17: Character Headshots in Storyboard Generation**
- Add `characterReferences` parameter to `generateStoryboardPanel()`
- Update storyboard route to look up and pass headshots via `toInlineData()`
- Record provenance after each panel generation

**Step 5 — Provenance Recording on All Generation Routes**
- Wire `recordProvenance()` into posesheet, locations, scenes, storyboard routes
- Each generation call records its sources + current versions

**Step 6 — Staleness Detection API**
- Build `GET /api/projects/:id/staleness` endpoint
- Query provenance table, compare recorded versions vs current versions
- Return stale asset summary

**Step 7 — Cascade Regeneration API**
- Build `POST /api/projects/:id/cascade-regenerate` endpoint
- Dependency-ordered regeneration loop
- Progress tracking

**Step 8 — UI: Staleness Badges + Project Health**
- `StaleBadge` component
- Wire into all phase pages (bible, lock, locations, scenes, storyboard)
- Project overview health card
- "Regenerate Stale Assets" floating action

**Step 9 — Phase 9: First Frames (build on top of brain infrastructure)**
- `generateFirstFrame()` function with multi-reference multimodal input
- API routes (generate, regenerate, approve, list, image)
- UI page at `/projects/[id]/first-frames`
- Readiness gate
- Phase transition logic
- Provenance recording for first frames

**Step 10 — Verification**
- On the WAYW Ep2 project: change a character's headshot → verify pose sheet + panels flagged stale → trigger cascade regen → verify all assets updated with new headshot → verify provenance records correct
- Run `npm run build` — zero TypeScript errors
- Push to main, verify Vercel deploy

---

### What's deferred (not in this plan)

- **Per-scene wardrobe overrides** — character wardrobe changes per scene (e.g., Donna in sweatpants in scene 1, summer dress in scene 2). Currently wardrobe is in the text description. This would require a new `scene_character_wardrobe` table and wardrobe-specific image references. Ship after the brain is stable.
- **Supabase database triggers for auto version-bumping** — right now version bumps are in application code. Could move to Postgres triggers for extra safety. Defer until the application-level approach proves unreliable.
- **WebSocket/SSE for real-time cascade progress** — use polling initially, upgrade if UX demands it.
- **Export: PDF storyboard / first-frames book** — build after first frames are generating correctly.

