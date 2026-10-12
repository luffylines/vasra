# VASRA Vercel + Supabase migration (in progress)

This is an **isolated migration branch**, not a production-ready deployment. Do not select Deploy on Vercel yet.

## Current compatibility blockers
- `server.cjs` is a long-running Node HTTP server; Vercel needs an API-function entry point.
- `node:sqlite` stores users, sessions, projects and audit locally; Vercel's local filesystem is ephemeral.
- Uploaded images are SQLite BLOBs; use a private Supabase Storage bucket and authorized API delivery.
- `setup-chairman.cjs` and `test.cjs` depend on the SQLite backend; migration must update provisioning and tests.
- `PUBLIC_ORIGIN` must match the final HTTPS deployment URL. Do not expose service-role keys to frontend code.

## Preparation completed
- A PostgreSQL schema matching users/sessions/projects/images/audit is staged in `supabase/migrations/20261012_initial_vasra.sql`.
- Existing application endpoints and role checks remain unchanged on `main`.

## Migration checklist (not yet completed)
1. Create a **separate** Supabase project for VASRA (do not use the existing unrelated project).
2. Apply schema after review and confirm private schema permissions.
3. Replace SQLite queries with server-side Postgres repository methods and migrate original records from the local `data/vasra.sqlite` if any.
4. Upload project photos to private Supabase Storage and migrate references.
5. Adapt routes to Vercel Node.js functions, remove local persistent-file assumptions.
6. Adapt one-time chairman provisioning, sessions, tests and rate-limiting to serverless.
7. Set Vercel environment variables, test public and private workflows, then deploy.

Never store Supabase credentials or the SQLite database in Git.
