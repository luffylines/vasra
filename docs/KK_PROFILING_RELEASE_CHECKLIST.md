# KK Profiling — database activation and GitHub visibility (STAGED)

> **Not production-ready.** No live KK migration or main-branch merge has been performed. Personal information of 15–30-year-old residents is sensitive, including data from minors.

## What the GitHub screenshot means

GitHub's default `main` branch contains the existing published release. The updated KK Registration/Login, SK Duty confirmations, Sitio Management, staff KK review, and verified Excel export currently live on branch:

`feature/kk-youth-profiling-20261024`

Review the GitHub **Draft PR #16**. It is stacked on `ui/contacts-form-map-20261024`, so merging only the KK branch without the underlying contact changes is not safe. A preview URL is immutable: opening an **older** deployment hostname shows the old build even after new pushes.

## Diagnosis, October 24, 2026

Read-only database inspection of the dedicated VASRA Supabase project found:

- `public.vasra_kk(text,jsonb,text)`: **absent**
- `vasra.kk_members`: **absent**
- `vasra.kk_sitios`: **absent**
- KK migration `20261024223000_kk_youth_profiling.sql`: **not applied**
- Vercel preview has environment variables for Supabase, so the missing **KK schema**, not a missing static page, is the immediate blocker.

The registration screen now calls `/api/kk/sitios` first and blocks submission until the KK backend exists, to avoid asking people to fill a form that cannot save. No credentials or resident data were accessed to diagnose this.

## Before enabling registration

1. Authorize and finalize SK privacy notice, data retention/erasure process, access controls, and how guardian consent/assent will be handled for registrants aged 15–17. Never collect real minors' personal data in an unapproved preview.
2. Make a restorable backup, compare staged migrations against applied migrations, and review the RLS/grants and endpoint authorization.
3. In a **separate testing environment**, apply `supabase/migrations/20261024223000_kk_youth_profiling.sql` only after approval. No test DB has been provisioned automatically.
4. Verify that `/api/kk/sitios` returns `{"sitios":[]}` before any records are created. Populate the official active Sitio/Purok list in SK Staff → KK Profiling → Sitio Management.
5. Use disposable test identities and exercise: registration, age limits, email/password login/logout, 5 profile saves, validation for region/city/barangay and year levels, submission, staff-only view, verified/rejected workflow, authorized points, redemption, and Excel export. Confirm that users without a valid staff session cannot read applications or retrieve verified exports.
6. Configure independent KK Google OAuth credentials/redirect and test actual preview-domain callback. Do not silently link password accounts to Google identities.
7. Run `npm test`, Supabase security advisors, and manual mobile/iPhone reviews. Enable production only after explicit SK approval of migration and release.
8. Create a reviewed production PR targeting `main` that includes any dependent staged PRs; merge only after all checks are ready. Merging `main` can trigger Vercel production deployment.

## User-visible behavior

- If the KK database is missing, a red **KK registration is not yet available** message appears above the form; **Create KK Account** remains disabled. **Retry** rechecks readiness.
- Once the approved migration is installed and responding, the register button becomes available. This does **not** bypass privacy/role policy requirements.

**Do not infer that a Vercel READY build or green GitHub Actions indicates successful end-to-end KK registration.**
