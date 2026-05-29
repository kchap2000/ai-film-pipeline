# Safe Development Workflow

The live app is served from the `main` branch. Do not develop directly on
`main`.

## Daily Workflow

1. Start from production:

   ```bash
   git switch main
   git pull --ff-only origin main
   git switch -c feature/name-of-change
   ```

2. Build locally:

   ```bash
   npm run build
   ```

3. Push the feature branch and open a pull request:

   ```bash
   git push -u origin feature/name-of-change
   ```

4. Test the Vercel Preview URL from the pull request.

5. Merge only after the preview is verified.

## Current Preview Safety Brake

Vercel currently has the same Supabase variables assigned to Production,
Preview, and Development. Until Preview uses a separate staging Supabase
database, this app blocks write API calls on Vercel Preview deployments.

Blocked in Preview by default:

- `POST /api/*`
- `PUT /api/*`
- `PATCH /api/*`
- `DELETE /api/*`

Read-only routes still work. This prevents preview branches from mutating the
production Supabase project by accident.

To enable full preview testing later, first point Vercel Preview environment
variables at staging Supabase, then set:

```text
ALLOW_PREVIEW_MUTATIONS=true
```

Only set that variable for the Preview environment after staging is isolated.

## Staging Database Status

Attempted setup:

- Supabase separate free staging project: blocked by the active free project
  limit.
- Supabase development branch: blocked because database branching requires a
  Pro plan.

Recommended next step: either upgrade Supabase to use a development branch or
pause/delete another free active project and create `ai-film-pipeline-staging`.

## Production Rules

- `main` is production.
- Never push directly to `main`.
- Never run destructive extraction or migration tests against production.
- Back up Supabase before production migrations.
- Keep schema changes additive until a preview/staging test has passed.
- Treat AI generation routes as write routes because they consume credits and
  create database rows.
