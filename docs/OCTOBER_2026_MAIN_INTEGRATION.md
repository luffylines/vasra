# SK VASRA October 2026: Main branch integration

This is an explicit reconciliation of the October 12 `main` and October 27 development histories, committed with **both branches as parents** so earlier work remains in Git history.

## Why the automatic GitHub merge conflicted

The October 12 `main` branch held an emergency **static-only** Vercel fix designed for an old SQLite server that could not run on Vercel. It wrote `public/`, hid `account.html` and deliberately disabled `/api` endpoints. That configuration is incompatible with the later, tested Vercel Functions + Supabase code.

## Merge decisions

| Main-only change | Reconciled outcome |
| --- | --- |
| `vercel.json` static-only build | Use the October 27 serverless `dist/` build, API rewrites and extensionless routes. **Do not restore the old static-only build.** |
| `dist/duty.js` and `dist/duty.html` | Use the October 27 SK-managed schedule/photo/contact views. They retain Manila time, automatic day highlighting, schedule refresh and safe fallback to scheduled status, and add the authorized SK closure override. |
| `dist/modern.css` | Use the newer responsive stylesheet, which retains today/current-day and open/closed markers while supporting subsequent SK portal UI work. |
| `scripts/prepare-vercel-static.cjs` | Superseded obsolete helper. Preserved by commit history, intentionally absent from working tree so it cannot disable staff/API access. |
| `VERCEL_STATIC_FIX.md` | Historic diagnosis in the old main commit; replaced by this current integration explanation. |
| `.github/workflows/tests.yml` | Enable Node 24 tests for the newly targeted `main` and integration branch (in addition to previously watched branches). |

## Before production

- Run `npm ci && npm test && npm run check:deploy` on the resolved branch and review GitHub Actions, including failures.
- Confirm QR manual/approved-card flow, SK vs KK roles, photo upload and review state, ID PDF download and emails, reward ledger, event attendance and mobile responsiveness.
- Resolve reviewed Supabase migration dependencies first: as of the integration review, `public.vasra_kk_scan_identity(text,jsonb,text)` is **missing** from the connected database. An automatic production deployment without that RPC breaks the new QR flow.
- Keep backup and audit tables, ledger rows and previously approved redemptions untouched. Do not migrate or edit production member data as part of this Git history reconciliation.
- The merge commit on a **feature branch** is not the same as merging to `main`. Production promotion is a separate action after tests and dependency checks.

This document records conflict-resolution decisions, not proof that the integrated application passed end-to-end tests.
