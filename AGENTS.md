# AGENTS.md — ai-film-pipeline

Required context for ANY agent (Codex, Cursor, Claude, etc.) working in this repo. Repo-specific docs still apply, but the brain + skills rules below are global law.

<!-- AGENT-BRAIN:START (managed — regenerate from AGENTS_BRAIN_INSTRUCTIONS.md) -->
## Khalil's Operating Brain — Instructions for All Agents

_Last generated: 2026-06-22. Mirrored as `CLAUDE.md` and `AGENTS.md` at connected roots, as
`AGENTS.md` in code repos including `/Users/khalilchapman/Documents/Command Center`, and as the
master file `~/Documents/Claude/AGENTS_BRAIN_INSTRUCTIONS.md`. Edit the master, then regenerate
with `python3 /Users/khalilchapman/Documents/Claude/sync_agent_brain_instructions.py`._

You are operating inside Khalil's connected workspace. Three things are global law: **the Brain**,
**the Skills Library**, and **safe brain edits**. Follow this every session, in every project.

### 1. The Brain — single source of truth
- **Live brain (the ONLY one to edit):** `/Users/khalilchapman/Desktop/brain.json`
- **Do NOT edit:** `/Users/khalilchapman/Documents/Claude/Projects/brain.json` — stale April copy.
- **At the START of a task:** read `brain.json`, find the relevant project's entry, and load its
  current phase, status, key contacts, next actions, and dates before doing work.
- **At the END of a task that changed anything** (status, deliverable, a contact, a decision, a
  next action): update that project's entry, set `_meta.lastUpdatedAt` to today and
  `_meta.lastUpdatedBy` to a short note. If the project has no entry, create one.

### 2. The Skills Library — single source of truth for skills
- **Canonical location:** `/Users/khalilchapman/Documents/Claude/Skills Library/` — one folder per
  skill, each with a `SKILL.md`. It is **git-tracked**.
- **Use skills from there.** NEVER copy a skill into a project folder, and NEVER save
  `-updated` / `-v2` copies. Edit in the library, then `git add -A && git commit -m "..."`.
- `_archive/` holds old duplicate backups (git-ignored). Don't use it as a working copy.
- `brain.json` has a `skills` block mapping each skill to its canonical path.
- **Installed-registry skills** (client-portal, film-story-production, video-prompting, docx, pptx,
  xlsx, pdf, etc.) load automatically — don't duplicate them on disk.
- There is **no "Seedance" skill** — use `video-prompting` for Seedance/Veo/Kling/Sora prompts.

### 3. Editing brain.json SAFELY (required write protocol)
`brain.json` is the whole memory layer; one malformed edit breaks every agent and scheduled task.
It is **git-tracked** in a scoped repo at `/Users/khalilchapman/Desktop`. Every write MUST follow:
1. **Read** the current file first (never write blind).
2. **Edit** it.
3. **Validate** before moving on:
   `python3 -c "import json;json.load(open('/Users/khalilchapman/Desktop/brain.json'))"`
   (or `jq . /Users/khalilchapman/Desktop/brain.json`). No invalid escapes (e.g. `\'`).
4. **Commit** = your backup + rollback:
   `git -C /Users/khalilchapman/Desktop add brain.json && git -C /Users/khalilchapman/Desktop commit -m "brain: <what changed>"`
- **Roll back a bad edit:** `git -C /Users/khalilchapman/Desktop checkout -- brain.json` (uncommitted),
  or `git -C /Users/khalilchapman/Desktop revert <sha>` for a committed one.
- **Required top-level shape:** always keep `_meta` and `projects`. Don't drop existing sections
  (`contacts`, `calendar`, `inboxAlerts`, `skills`, ...) unless intentionally.
- **Concurrency:** do read → edit → validate → commit in one pass. If git shows the file changed
  under you (a scheduled task wrote it), re-read and re-apply your change.

### 4. Per-project protocol
- Every project folder's `CLAUDE.md` contains a managed block between
  `<!-- BRAIN-PROTOCOL:START -->` and `<!-- BRAIN-PROTOCOL:END -->`. When working in a project,
  follow that block. **New project?** Create its `CLAUDE.md` and paste the marked block from any
  existing project.

### 5. Scheduled tasks
- Live in `/Users/khalilchapman/Documents/Claude/Scheduled/<task>/SKILL.md`. They read and write
  the **live** `brain.json` (following the §3 protocol) and regenerate the dashboard.

### 6. Reference docs
- Audit & inventory: `/Users/khalilchapman/Desktop/SKILLS_INVENTORY.md`
- Architecture: `/Users/khalilchapman/Documents/Claude/Projects/BRAIN_ARCHITECTURE.md` (see Layer 4)
- Library README: `/Users/khalilchapman/Documents/Claude/Skills Library/README.md`

### Quick rules
**Do:** read the brain first · validate + commit after every brain edit · one skill = one library
folder · commit skill edits.
**Don't:** edit the stale `Projects/brain.json` · write the brain without validating · duplicate or
copy skills · make `-updated` copies · leave the brain stale after a change.
<!-- AGENT-BRAIN:END -->
