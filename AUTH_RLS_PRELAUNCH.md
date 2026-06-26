# AUTH + RLS — Pre-Launch Hardening Spec

> **The gate before sharing with anyone.** Today the app runs as an anonymous
> superuser: the **public** `NEXT_PUBLIC_SUPABASE_ANON_KEY` has full read/write,
> route handlers operate on any `project_id` with almost no ownership check, and
> the data client uses the **service role** (bypassing RLS entirely). This is fine
> for a solo internal tool; it is unshippable the moment a second person — a
> client, a collaborator — gets a link.
>
> This spec turns it into a multi-tenant app: Google sign-in, per-project
> authorization on every route, real Row-Level Security so a leaked anon key is
> inert, and a client-share flow. Read after FINAL_VISION.md / REVISION_VISION.md.
> Status tracked in PROGRESS.md.

---

## DEMONSTRATED RISK (why this is P0)

During the "We Bought a Bar" test run, a plain local script holding only the
**public** anon key (it ships in the browser bundle — it is not a secret):
created projects, inserted characters/scenes/locations, uploaded images, and drove
the entire pipeline — with **no login**. Anyone who views source on the deployed
app can extract that key and do the same to **any** project in the database. There
is currently no tenant boundary. That is the whole reason this work exists.

---

## CURRENT STATE — AUDIT (precise)

### ✅ Already scaffolded (keep)
| Piece | File | State |
|---|---|---|
| Google OAuth sign-in | `src/app/login/page.tsx` | `signInWithOAuth({provider:'google'})` → `/auth/callback`. Works. |
| OAuth callback | `src/app/auth/callback/route.ts` | Exchanges code → session cookie. Works. |
| SSR session client | `src/lib/supabase-server.ts` | Cookie-based, anon key. Good. |
| Session read in routes | `src/lib/supabase-route.ts` → `createRouteClient()` | Reads real user; **falls back to anonymous** when no cookie. |
| Authorization primitive | `src/lib/project-access.ts` → `getProjectAccess()` | Full role model: owner / producer / client / reviewer, with `canManage/canReview/canGenerate/canEditProject`. **Built but barely used.** |
| Collaborators table | `project_collaborators` (+ `collaborators/route.ts`) | Owner row created on project create; invite path exists. |
| `projects.user_id` | schema + `projects` POST/GET | New projects stamp `user_id` when authenticated; GET filters by owner+collaborator. |

### ❌ The gaps (the actual work)
1. **Data client bypasses RLS.** `src/lib/supabase.ts` `getSupabase()` uses
   `SUPABASE_SERVICE_ROLE_KEY || ANON_KEY`. Route handlers use this privileged
   client, so **RLS is not the enforcement layer** — app code is. And app code
   doesn't enforce it (next point).
2. **Authorization is enforced on only 6 of 32 project routes.** `getProjectAccess`
   is called in `collaborators, activity, automation, decisions, generation-jobs,
   brain`. The other **26** — `cast, lock, locations, scenes, storyboard,
   first-frames, video-clips, agent, revisions, hub, auto-pipeline, assembly, qa,
   elements, posesheet, bible, upload, files, …` — take a `project_id` and act on
   it with **no ownership/role check**. Any logged-in (or anonymous) caller can
   read or mutate any project by guessing/lifting its UUID.
3. **Anonymous fallback = open door.** `createRouteClient()` returns
   `{id:"anonymous", isAnonymous:true}` when there's no session, and routes happily
   proceed. There is no "must be signed in" gate.
4. **No session gate in middleware.** `src/middleware.ts` only blocks *preview*
   writes (`ALLOW_PREVIEW_MUTATIONS`). It does not require auth for `/projects/*`
   pages or `/api/projects/*`.
5. **RLS is effectively off** (anon key has full access — demonstrated above).
6. **Storage bucket `project-uploads` is public** (`public: true`) — every
   generated image/headshot is world-readable by URL.
7. **Existing projects have `user_id = null`** (created anonymously) — they must be
   adopted by a real owner before `NOT NULL` + RLS can be turned on.
8. **No Sign-Out anywhere; no client-share UI.**

---

## KEY ARCHITECTURAL DECISION

There are two ways to enforce tenancy. **Pick A for launch; treat B as the
long-term.** They are not mutually exclusive — do A's app-layer authz now AND turn
on RLS defensively so the public anon key is inert either way.

### A — App-layer authz (service-role client) + RLS as a hard backstop ✅ RECOMMENDED
- Routes keep using a privileged server client, but **every project-scoped route
  must call `getProjectAccess` and 403/404 on failure** before doing anything.
- RLS is **enabled with restrictive policies** so the *public anon key* can do
  nothing useful — it's the safety net if an app-layer check is ever missed or the
  key leaks. The service-role client (server-only secret) bypasses RLS by design,
  which is why the app-layer check is mandatory, not optional.
- **Why:** least churn. The route handlers, the no-base64-in-bulk patterns, the
  CLI fulfillment scripts, and the orchestrator all keep working. Ship in days.

### B — User-scoped client + RLS as the primary enforcement (long-term)
- Each request builds a Supabase client bound to the **user's** JWT (anon key + the
  session). RLS policies do all authz; app code stops hand-filtering.
- Cleaner and harder to get wrong, but it's a broad refactor (every route swaps
  clients; server-to-server steps like the orchestrator calling its own API need a
  service path; large-payload patterns need re-verification). Do it after launch.

**This spec implements A.**

---

## SPRINT PLAN

| Sprint | Scope | Outcome |
|---|---|---|
| **S1 — Session gate** | Middleware + page guards require a signed-in user for `/projects/*` and `/api/projects/*`; Sign-Out in ProjectNav; kill the anonymous fallback in prod | No anonymous access anywhere |
| **S2 — Route authorization** | A shared `requireProjectAccess()` helper; call it in all 32 project-scoped routes; map role → permission (read vs review vs generate vs manage) | Every route enforces tenancy + role |
| **S3 — RLS + migration** | Backfill `user_id`; enable RLS on every table with owner/collaborator policies; lock the Storage bucket; rotate keys; service-role secret server-only | Public anon key is inert |
| **S4 — Collaborator + client share** | Invite-by-email flow; client/reviewer get read+review-only Screening Room (pairs with REVISION_VISION R6); accept-invite page | Share a project safely |
| **S5 — Automation keys** | CLI scripts (`fulfill-clips`, seeds) + orchestrator self-calls use a service token, not the public anon key; document | Automation keeps working post-lockdown |
| **S6 — Verify** | Run Supabase **security advisors**; pen-test the tenant boundary (user B cannot touch user A's project by id); CI check that no project route ships without `requireProjectAccess` | Provable isolation |

---

## S1 — SESSION GATE

**Middleware** (`src/middleware.ts`) — add session enforcement alongside the
existing preview-write block:
- For `/api/projects/:path*` (writes and reads) and `/projects/:path*` pages:
  read the Supabase session (via `@supabase/ssr` in middleware using the request
  cookies). No session → API returns `401`; page redirects to `/login?next=<path>`.
- Allow-list: `/login`, `/auth/callback`, `/api/health`, static assets.
- Keep the preview-write block.

**Kill the anonymous fallback in prod** (`createRouteClient`): when there is no
session and `VERCEL_ENV === 'production'`, return `user = null` (routes already
`return 401 if (!user)`), instead of the `anonymous` superuser. Keep the anonymous
convenience ONLY for local dev (`NODE_ENV !== 'production'`) behind an explicit
`ALLOW_ANON_DEV=true`.

**Sign-Out**: add to `ProjectNav` footer — `supabase.auth.signOut()` →
redirect `/login`.

---

## S2 — ROUTE AUTHORIZATION (the core)

Add one helper and call it everywhere.

```ts
// src/lib/require-access.ts
import { getProjectAccess, type ProjectAccess } from "@/lib/project-access";

type Need = "read" | "review" | "generate" | "manage";

/** 401 if not signed in, 404 if no access to this project, 403 if role too low. */
export async function requireProjectAccess(
  supabase, user, projectId: string, need: Need = "read"
): Promise<{ ok: true; access: ProjectAccess } | { ok: false; res: Response }> {
  if (!user || user.isAnonymous)
    return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const access = await getProjectAccess(supabase, projectId, user);
  // 404 (not 403) when there's no relationship at all — don't confirm the id exists.
  if (!access) return { ok: false, res: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const allowed =
    need === "read"     ? access.canReview || access.canManage :
    need === "review"   ? access.canReview :
    need === "generate" ? access.canGenerate :
                          access.canManage;
  if (!allowed) return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, access };
}
```

**Apply to every project-scoped route**, mapping HTTP verb / action → `need`:
- `GET` (read assets, bible, hub, watch, qa report) → `read`
- Submitting director notes / approving a revision plan / leaving feedback → `review`
- Any generation or regeneration (cast, lock, locations, scenes, storyboard,
  first-frames, video-clips, posesheet, elements, auto-pipeline `step/start`,
  assembly, qa POST, revisions run) → `generate`
- Project settings, production_notes, aspect ratio, mode, delete, collaborators,
  unlock/recast, swap-approved-image → `manage`

**Result of the role map:** a **client** can open the Screening Room and leave
notes (`review`) but cannot trigger generation or change settings; a **producer**
can generate; an **owner** can manage collaborators and delete. This is the
shareable-with-clients behavior.

**CI guardrail:** a test that greps every `src/app/api/projects/[id]/**/route.ts`
for `requireProjectAccess` and fails the build if a handler is missing it — so new
routes can't ship unprotected (this is exactly how route #2's gap happened).

---

## S3 — RLS + MIGRATION

### 1. Backfill owners (run first, while RLS still off)
```sql
-- Adopt every legacy anonymous project under Khalil's auth user.
-- Get the uuid from auth.users after he signs in once with Google.
update projects set user_id = '<KHALIL_AUTH_UID>' where user_id is null;
```
Also ensure an owner `project_collaborators` row exists for each.

### 2. Enable RLS + policies (defensive backstop for the public anon key)
RLS is keyed on a reusable membership check:
```sql
-- True if the current end-user (anon key + their JWT) owns or collaborates on the project.
create or replace function public.is_project_member(pid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from projects p where p.id = pid and p.user_id = auth.uid()
  ) or exists (
    select 1 from project_collaborators c
    where c.project_id = pid and c.status = 'active'
      and (c.user_id = auth.uid() or c.email = auth.jwt()->>'email')
  );
$$;

-- projects: owner or collaborator can select; only owner can write.
alter table projects enable row level security;
create policy projects_select on projects for select using (is_project_member(id));
create policy projects_modify on projects for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every child table (characters, scenes, locations, cast_variations,
-- location_variations, scene_variations, character_poses, storyboard_panels,
-- first_frames, video_clips, assembled_videos, qa_reports, project_elements,
-- pipeline_runs, revisions, asset_provenance, project_activity,
-- project_collaborators, extractions, project_files, …):
--   enable RLS, policy USING is_project_member(project_id).
--   (generated via a DO loop over the table list.)
```
> The **service-role** client the app uses bypasses ALL of this — that's expected
> and is why S2's app-layer check is the real gate. These policies exist so the
> **public anon key** (and any leaked copy) can read/write **nothing** without a
> valid matching session. After this lands, re-run the test-run script with the
> anon key: it must fail.

### 3. Tighten the data client
- `SUPABASE_SERVICE_ROLE_KEY` must be a **server-only** env var (it already is, but
  confirm it is NOT `NEXT_PUBLIC_*` and never imported into a client component).
- **Rotate** the anon + service keys after lockdown (the current anon key has been
  used in shells/notes and should be considered compromised).

### 4. Storage
- Flip `project-uploads` to **private**; serve images through the existing
  `/image` route handlers (which now run behind `requireProjectAccess`) using
  **signed URLs** (`createSignedUrl`, short TTL), or proxy the bytes. Update the
  cast headshot flow that currently relies on `getPublicUrl()`.
- Storage RLS policy: object path is prefixed with `project_id`; allow read/write
  only to project members.

---

## S4 — COLLABORATOR + CLIENT SHARE
- **Invite** (owner-only): `POST /collaborators {email, role}` → pending
  `project_collaborators` row; email a magic link to `/accept?token=…`. On first
  Google sign-in with that email, the row flips to `active` and `user_id` is set.
- **Client/reviewer experience**: their session resolves to `canReview` only →
  ProjectNav shows just the Screening Room + Director's Notes; all generate/manage
  controls are hidden client-side AND blocked server-side (defense in depth). This
  is the natural home for REVISION_VISION R6 (client review loop).
- **Revoke**: owner sets status `removed`; `is_project_member` excludes them
  immediately.

---

## S5 — AUTOMATION KEYS (don't break the pipeline)
The CLI runners and the orchestrator's own server-to-server calls currently ride
the public anon key. After lockdown:
- `scripts/fulfill-clips.mjs` and the seed scripts → use a **service token** read
  from `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`), never the anon key. Update their
  `createClient(...)` calls. Document in the script headers.
- The orchestrator (`auto-pipeline`) calls its own `/api/...` routes server-side;
  those calls carry no user cookie. Give the orchestrator a **service-internal
  bypass**: an internal header/secret (`X-Internal-Token`) that `requireProjectAccess`
  honors for same-origin server calls, OR run those steps through a service client
  that has already resolved the run's owning project. (Pick the header approach —
  smaller blast radius, easy to audit.)
- The image `/image` endpoints used by the UI stay user-gated.

---

## S6 — VERIFY (must pass before launch)
1. **Supabase security advisors** — run `get_advisors(security)`; resolve every
   "RLS disabled" / "policy missing" finding.
2. **Tenant boundary test** — two Google accounts; user B cannot GET, mutate, or
   guess user A's project by id (expect 404/403 on all 32 routes).
3. **Anon-key inert test** — re-run the test-run seed script with the public anon
   key; every insert/select must be denied by RLS.
4. **Client-role test** — a `client` collaborator can watch + leave notes, and is
   blocked (server-side 403) from any generate/manage route.
5. **CI** — the "every project route calls `requireProjectAccess`" grep test is
   green.
6. **Regression** — a full auto run still completes for an authenticated owner;
   the CLI fulfillment still works with the service token.

---

## ROLLOUT / ROLLBACK
- Land S1–S3 on a branch; deploy to a **staging** Supabase + Vercel preview first
  (preview writes already gated by middleware). Backfill + RLS are the irreversible
  step — snapshot the DB before enabling RLS.
- **Rollback:** `alter table … disable row level security;` per table restores the
  old behavior instantly if a policy is too strict; keep the disable script handy.
- Flip production only after S6 passes on staging.

## RISKS / OPEN QUESTIONS
1. **Service-role bypass is load-bearing.** If a project route forgets
   `requireProjectAccess`, RLS won't save it (service role bypasses). The CI grep
   is the mitigation — treat it as required, not optional.
2. **Orchestrator self-calls** are the trickiest auth case (no user cookie). The
   `X-Internal-Token` header must be a real secret and only honored for same-origin
   — get this reviewed.
3. **Key rotation** will break any place still hardcoding the old anon key (notes,
   shells, the seed scripts) — sweep for it.
4. **Storage signed-URL TTL** vs. the UI lazy-load + base64 cache: pick a TTL long
   enough for a review session, short enough to not be a durable public link.
5. **Anonymous local dev**: keep it easy (the `ALLOW_ANON_DEV` flag) so the
   pipeline is still scriptable locally without OAuth.
6. **Existing live data**: confirm with Khalil which legacy projects to adopt vs.
   archive before backfilling `user_id`.
