# Claude Code Instructions — AI Film Pipeline
## How to Continue Building
When asked to "continue" or "keep building", do this:
1. Read PROGRESS.md to find the current phase (look for 🔄 Next Up)
2. Build everything in that phase's checklist that isn't marked [x]
3. When the phase is complete, mark it ✅ COMPLETE and set the next phase to 🔄 Next Up
4. Sync files to "/Users/khalilchapman/Desktop/Ai Film Pipeline/" per the sync rule below
5. Report back what was built
Never ask what to build next — PROGRESS.md is the source of truth.
## Progress Tracking (REQUIRED)
After completing ANY work in this project — building a feature, creating a file, fixing a bug, running a command — you MUST update PROGRESS.md at /Users/khalilchapman/Desktop/ai-film-pipeline/PROGRESS.md.
Update rules:
- Mark completed checklist items with [x]
- Change phase status from ⬜ Not Started → 🔄 In Progress → ✅ COMPLETE
- Add a one-line entry to the Build Log with today's date and what was done
- If you create new files, note the file path in the relevant phase checklist
- If you hit a blocker, mark it ❌ Blocked and note why
## Project Context
This is a 7-phase AI Film Production Pipeline. Architecture reference: ARCHITECTURE.html
Build order: Phase 01 → 02 → 03 → 04 → 05 → 06 → 07. Do not skip phases.
Phase 01 is COMPLETE. Begin Phase 02.
## Stack
Next.js 14 (App Router), Tailwind CSS, Supabase (Postgres + Storage), Anthropic Claude API, Google Imagen API, Vercel
## Supabase
Project ref: onavhfhpdxwzdwotkddq
URL: https://onavhfhpdxwzdwotkddq.supabase.co
## File Sync (REQUIRED)
After any significant change, copy these files to /Users/khalilchapman/Desktop/Ai\ Film\ Pipeline/:
- supabase/schema.sql
- src/lib/extract.ts
- src/app/api/extract/route.ts
- src/lib/types.ts
- PROGRESS.md
