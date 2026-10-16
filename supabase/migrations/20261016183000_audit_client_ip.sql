-- Audit request metadata: store the validated, Vercel-observed client IP on
-- FUTURE audit INSERTs only. Historical entries remain NULL (never fabricate).
-- The existing audit no-UPDATE/no-DELETE triggers and RLS remain unchanged.
BEGIN;
ALTER TABLE vasra.audit ADD COLUMN IF NOT EXISTS ip_address inet;
CREATE OR REPLACE FUNCTION vasra.capture_audit_ip()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  headers jsonb;
  raw_ip text;
BEGIN
  -- Only the server-to-Supabase RPC sends this private request header.
  -- PostgREST exposes the received request headers via request.headers.
  BEGIN
    headers := nullif(current_setting('request.headers', true),'')::jsonb;
    raw_ip := nullif(btrim(headers->>'x-vasra-client-ip'),'');
    IF raw_ip IS NOT NULL THEN
      NEW.ip_address := raw_ip::inet;
    END IF;
  EXCEPTION WHEN others THEN
    -- Missing/malformed metadata must never prevent a legitimate business action.
    NEW.ip_address := NULL;
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_capture_ip ON vasra.audit;
CREATE TRIGGER audit_capture_ip BEFORE INSERT ON vasra.audit
FOR EACH ROW EXECUTE FUNCTION vasra.capture_audit_ip();
REVOKE ALL ON FUNCTION vasra.capture_audit_ip() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION vasra.capture_audit_ip() TO service_role;
COMMIT;
