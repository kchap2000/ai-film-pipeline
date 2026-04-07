# Claude Code — AI Film Pipeline
## Operating Mode: FULLY AUTONOMOUS
You have full authority to build, fix, refactor, commit, and deploy **without asking permission or checking in**. Do not say "Should I…", "Would you like me to…", or "Let me know if…". Just execute. When something is ambiguous, pick the most reasonable interpretation and proceed.

---

## Core Workflow

### "Continue" or "Keep building"
1. Read `PROGRESS.md` — find the phase marked 🔄 Next Up
2. Build every unchecked item in that phase
3. Run `npm run build` locally, fix any TypeScript errors
4. Commit + push to `origin/main`
5. Mark phase ✅ COMPLETE, set next phase 🔄 Next Up in PROGRESS.md
6. Report what was built

### "Fix [bug/issue]"
1. Read the relevant source files
2. Fix the issue
3. Run `npm run build` to confirm no TS errors
4. Commit with a clear message + push
5. Update PROGRESS.md build log

### "Deploy" / "Push"
```bash
cd /Users/khalilchapman/Desktop/ai-film-pipeline
git add -A
git commit -m "your message here"
git push
```
Vercel auto-deploys on every push to `main`. No manual deploy step needed.

---

## Project Context
7-phase AI Film Production Pipeline for creating full storyboards from a screenplay/script PDF.

**Live URL:** https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app
**Supabase project ref:** `onavhfhpdxwzdwotkddq`
**Supabase URL:** `https://onavhfhpdxwzdwotkddq.supabase.co`

**Pipeline phases (in order):**
1. Project ingestion (upload PDF/DOCX/TXT)
2. LLM extraction (Claude parses characters, scenes, structure)
3. Film Bible (auto-generated, inline-editable)
4. AI Casting (Gemini image gen, 10 variations per character)
5. Character Lock (approve headshot + generate pose/reference sheet)
6. Location Scouting (5 AI images per location, approve best)
7. Scene Scouting (3 atmospheric images per scene, approve best)
8. Storyboard (Claude breaks scenes into shots, Gemini renders each panel)

---

## Stack
- **Framework:** Next.js 14 App Router, TypeScript, Tailwind CSS
- **Database:** Supabase (Postgres) — base64 images stored directly in DB columns
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) + Google Gemini (`gemini-2.5-flash-preview-05-20` with `responseModalities: [Modality.IMAGE, Modality.TEXT]`)
- **Deployment:** Vercel (auto-deploy on push to main)
- **Auth:** Stub only — `createRouteClient()` returns anonymous user until Google Auth is wired up

---

## Critical Architecture Rules — Do Not Break These

### Auth stub — never filter by user_id
`src/lib/supabase-route.ts` returns `{ id: "anonymous", email: null }` as the user. The `projects` table does NOT have a `user_id` column yet. **Never add `.eq("user_id", user.id)` to any query** — it will break every API route with a Supabase column-not-found error. Auth scoping is a pre-launch task.

### No base64 images in bulk API responses
All tables store images as base64 strings in columns like `image_url`, `pose_sheet_url`, `approved_image_url`, etc. These are 500KB–1MB each. **Never `select("*")` on any table that has image columns in a bulk GET handler.** Always select only metadata columns and return image URLs via dedicated `/image` endpoints that the UI lazy-loads.

**Dedicated image endpoints (already built):**
- `GET /api/projects/:id/cast/image?variation_id=xxx` → `{ image_url }`
- `GET /api/projects/:id/cast/image?character_id=xxx&type=pose` → `{ pose_sheet_url }`
- `GET /api/projects/:id/locations/image?variation_id=xxx` → `{ image_url }`
- `GET /api/projects/:id/locations/image?location_id=xxx&type=approved` → `{ approved_image_url }`
- `GET /api/projects/:id/scenes/image?variation_id=xxx` → `{ image_url }`
- `GET /api/projects/:id/scenes/image?scene_id=xxx&type=approved` → `{ approved_scout_image_url }`
- `GET /api/projects/:id/storyboard/panel-image?panel_id=xxx` → `{ image_url }`

If you add a new table with image columns, create a matching `/image` endpoint and use `imageCache` lazy loading in the UI.

### Vercel function timeout
Max 300 seconds. Set `export const maxDuration = 300` on any generation route. Never generate all items in a single request when there are many — do per-item or per-scene batching.

### Next.js caching
All API routes that read from the DB must have `export const dynamic = "force-dynamic"` to prevent stale cached responses.

---

## Known Gotchas

- **pdf-parse on Vercel:** Use `require("pdf-parse/lib/pdf-parse.js")` — NOT `require("pdf-parse")`. The default import runs test-file initialization that crashes in serverless.
- **Gemini image generation:** Uses `responseModalities: [Modality.IMAGE, Modality.TEXT]` from `@google/genai`. Model: `gemini-2.5-flash-preview-05-20`. Real-person likenesses are often blocked (HTTP 200 but no image parts in response) — always check for empty `imageParts` and fall back to a text-only retry.
- **Pose sheet SVG placeholder:** When Gemini blocks image generation, `generatePoseSheet()` returns a base64 SVG. The posesheet route checks `result.url.startsWith("data:image/svg+xml")` and retries text-only. Returns `is_placeholder: boolean` in response.
- **Git index.lock:** The sandbox cannot delete `.git/index.lock`. Khalil pushes all commits from his own terminal. Write commit messages and file lists clearly so he can push.
- **Supabase payload limit:** If a Supabase query returns > ~5MB, `data` silently comes back `null`. This is why all bulk queries must exclude image columns.

---

## File Sync Rule
After any significant change, the following files should be copied to `/Users/khalilchapman/Desktop/Ai\ Film\ Pipeline/` so they're accessible from Cowork:
- `supabase/schema.sql`
- `src/lib/extract.ts`
- `src/app/api/extract/route.ts`
- `src/lib/types.ts`
- `PROGRESS.md`
- Any new API route files

---

## Progress Tracking (REQUIRED)
After completing ANY work, update `PROGRESS.md`:
- Mark completed checklist items `[x]`
- Update phase status: ⬜ Not Started → 🔄 In Progress → ✅ COMPLETE
- Add a one-line entry to the Build Log with today's date
- Note new file paths in the relevant phase checklist
- If blocked, mark ❌ Blocked with the reason

---

## Pre-Launch Task (NOT YET — hold until Khalil says go)
Google Auth + user scoping. When this is triggered:
1. Supabase Auth with `signInWithOAuth({ provider: 'google' })`
2. Auth callback at `/auth/callback` (already scaffolded)
3. Add `user_id uuid references auth.users(id)` to `projects` table
4. Update all API routes to filter `.eq("user_id", user.id)` (remove the stubs)
5. Protect all `/projects/*` routes with middleware
6. Show Sign Out button in dashboard footer + ProjectNav

Do not implement this until explicitly asked.

---

## Current Outstanding Bugs (fix these proactively)
- [ ] Compound location names in existing "Life of The Lazy Mon" project (e.g. "Khalil's Apartment / Apartment Complex Exterior / City Streets / The Rock Bar") — Claude Haiku normalization now runs for new projects but old data has the verbose names. Could offer a one-time migration.
- [ ] Janet and Khalil pose sheets are SVG placeholders — Gemini policy blocks real-person likenesses. Text-only retry is wired in but may also fail. Badge shows "Placeholder — Regenerate".
- [ ] Janet character has no physical description in the source PDF — only personality info.
