# SKVASRA Free Health Monitor

The GitHub Actions workflow at [`.github/workflows/skvasra-free-health-monitor.yml`](../.github/workflows/skvasra-free-health-monitor.yml) checks the existing SKVASRA Vercel sites and Supabase-backed public read endpoint **twice daily**, without storing passwords, adding database tables, or paying for a monitoring service.

## Schedule (Philippines)

- **08:17 AM PHT** — `17 0 * * *` UTC
- **08:17 PM PHT** — `17 12 * * *` UTC

The combined workflow cron is `17 0,12 * * *`. GitHub Actions schedules are **best effort**: runs may be delayed, skipped at busy times, or disabled for a public repository after 60 days without repository activity.

## What is checked

1. **New Vercel domain:** `https://www.skvasra.app/` returns a valid SK VASRA HTML page.
2. **Legacy Vercel domain:** `https://vasra.vercel.app/` does the same.
3. **Supabase database:** `GET https://www.skvasra.app/api/kk/sitios` returns the expected JSON shape from the existing `vasra_kk('sitios')` database function, which only **SELECTs** active Sitio names/IDs. The response is already `Cache-Control: no-store, private`.

The monitor only prints status and public Sitio count, **not** private KK profiles, credentials, member data, or fetched Sitio entries. It uses real HTTPS GET requests with a timeout and one retry per endpoint. No Supabase service-role key or GitHub repository secret is needed.

## Failure alerts and recovery

- A failed GitHub Actions run automatically **creates one GitHub Issue** titled `[SKVASRA] Vercel / Supabase health check failed`.
- Repeated failures reuse the open issue, avoiding duplicate issues.
- A successful run automatically **closes that issue** with a recovery note.
- To receive email/push alerts, enable GitHub notifications for the repository and Actions or subscribe/watch its Issues. The workflow itself records failed runs even when notifications are off.
- GitHub Issues must be enabled, and the repository's Actions must allow the built-in `GITHUB_TOKEN` the declared `issues: write` permission. If either is disabled, the issue alert cannot be created.
- For detailed failures, open GitHub → **Actions** → **SKVASRA Free Health Monitor** → latest run.

## Manual verification

In GitHub, open **Actions → SKVASRA Free Health Monitor → Run workflow** and select `main`. Alternatively, from the repository:

```bash
python3 -m unittest discover -s tests -p 'test_skvasra_health_monitor.py' -v
python3 scripts/check_skvasra_health.py
```

Neither command writes to the production database.

## Keeping the Free tiers healthy

**Supabase Free:** Low activity can still result in pausing over a seven-day period. A couple of read-only checks can help record legitimate database activity, but **do not guarantee** protection from automatic pausing. Review Supabase's pausing-warning emails and save independent backups of important KK data.

**Vercel Hobby:** No routine inactivity timeout for a healthy production deployment, but deployments may be paused for exceeding the plan's usage allowances or other applicable limits. Monitor **Vercel → Usage** for function usage, data transfer, and other quota warnings. Automated health checks do not raise your usage limits and cannot resume a paused deployment.

**GitHub Actions:** The twice-daily checks themselves use minimal CI minutes; keep Actions enabled and review any warnings about paused scheduled workflows.

Official documentation:
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://vercel.com/docs/plans/hobby
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
