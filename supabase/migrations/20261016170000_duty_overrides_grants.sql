-- Fix 503 GET /api/duty-status by granting the existing server-only RPC role
-- the table permissions required by public.vasra_duty(...), which is SECURITY INVOKER.
-- This migration changes privileges only; it does not modify duty history or schedules.
BEGIN;

GRANT SELECT, INSERT, UPDATE ON TABLE vasra.duty_overrides TO service_role;
-- Do not grant permissions to public client roles or to visitors.
REVOKE ALL ON TABLE vasra.duty_overrides FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
COMMIT;
