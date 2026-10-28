# SK Duty 503 diagnosis and activation

On October 16, 2026, `GET /api/duty-status` repeatedly returned HTTP 503 on Vercel while `/api/projects` and `/api/transparency` returned 200.

## Confirmed database mismatch

`public.vasra_duty(text,jsonb,text)` exists and is `SECURITY INVOKER`. The `service_role` can execute it and bypasses RLS, but had **no SELECT, INSERT, or UPDATE privileges** on `vasra.duty_overrides`. The function selects from this table on every status request and upserts into it for authorized status changes.

## Staged fix (production database NOT changed)

Review and, **only after explicit production approval**, apply `supabase/migrations/20261016170000_duty_overrides_grants.sql` to the correct VASRA Supabase project. This grants `service_role` SELECT, INSERT, UPDATE only; public client roles retain no access. No table data, existing RLS, SK roster, or role logic is changed.

## Verify after activation

```sql
SELECT
 has_table_privilege('service_role', 'vasra.duty_overrides', 'SELECT') AS can_read,
 has_table_privilege('service_role', 'vasra.duty_overrides', 'INSERT') AS can_insert,
 has_table_privilege('service_role', 'vasra.duty_overrides', 'UPDATE') AS can_update,
 has_table_privilege('anon', 'vasra.duty_overrides', 'SELECT') AS anon_can_read;
```

Expected: first three `true`, last `false`. Then request `https://vasra.vercel.app/api/duty-status`; expect 200 and JSON with a date and mode (`auto` or `closed`). Test an authorized Chairperson's override only in a safe test window or staging; **do not modify a real day's office status just to test**. Confirm GET 503 errors stop. Separate `POST /api/login` 401 indicates a failed sign-in attempt, not this duty permission issue.

Vercel runtime-log connector returned 403 to this session, so direct per-request stack traces were unavailable. The privilege mismatch was confirmed through read-only Supabase introspection.
