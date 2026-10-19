-- Keep staff sessions for exactly 7 days from login/credential rotation.
-- All login paths (password, Google OAuth, password change) insert into vasra.sessions.
-- This trigger corrects the existing 8-hour expiry in their respective RPC functions
-- without replacing large existing functions that other migrations may have modified.
-- Logout, account revocation, password reset and email change still delete sessions.
BEGIN;

CREATE OR REPLACE FUNCTION vasra.staff_session_seven_day_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.expires := transaction_timestamp() + interval '7 days';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION vasra.staff_session_seven_day_expiry() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS vasra_staff_session_seven_day_expiry ON vasra.sessions;
CREATE TRIGGER vasra_staff_session_seven_day_expiry
BEFORE INSERT ON vasra.sessions
FOR EACH ROW
EXECUTE FUNCTION vasra.staff_session_seven_day_expiry();

COMMIT;
