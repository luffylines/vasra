-- KK-only password recovery. SK staff account tokens remain separate.
-- Server-side service_role only, with one active hashed token per KK member.
CREATE TABLE IF NOT EXISTS vasra.kk_password_resets(
 member_id uuid PRIMARY KEY REFERENCES vasra.kk_members(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS kk_password_resets_expiry_idx ON vasra.kk_password_resets(expires_at);
REVOKE ALL ON vasra.kk_password_resets FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON vasra.kk_password_resets TO service_role;
CREATE OR REPLACE FUNCTION public.vasra_kk_password_reset(
 action text,payload jsonb DEFAULT '{}'::jsonb,session_hash text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 target vasra.kk_members;
 match_token vasra.kk_password_resets;
 email_input text;
 hashed_token text;
 hashed_password text;
BEGIN
 IF action='request' THEN
  email_input=lower(btrim(coalesce(payload->>'email','')));
  hashed_token=coalesce(payload->>'token_hash','');
  IF length(email_input)>160 OR email_input !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR hashed_token !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('error',400); END IF;
  SELECT * INTO target FROM vasra.kk_members WHERE email=email_input LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
  -- A fresh request cancels previous recovery links for this member.
  INSERT INTO vasra.kk_password_resets(member_id,token_hash,created_at,expires_at)
  VALUES(target.id,hashed_token,clock_timestamp(),clock_timestamp()+interval '30 minutes')
  ON CONFLICT(member_id) DO UPDATE SET token_hash=excluded.token_hash,
   created_at=excluded.created_at,expires_at=excluded.expires_at;
  RETURN jsonb_build_object('ok',true,'delivery_email',target.email);
 END IF;
 IF action='cancel' THEN
  DELETE FROM vasra.kk_password_resets WHERE token_hash=coalesce(payload->>'token_hash','');
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF action='confirm' THEN
  hashed_token=coalesce(payload->>'token_hash','');
  hashed_password=coalesce(payload->>'password_hash','');
  IF hashed_token !~ '^[a-f0-9]{64}$' OR length(hashed_password)<30 OR length(hashed_password)>400
  THEN RETURN jsonb_build_object('error',400); END IF;
  SELECT * INTO match_token FROM vasra.kk_password_resets
    WHERE token_hash=hashed_token AND expires_at>clock_timestamp()
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',400,'reason','expired_or_used'); END IF;
  UPDATE vasra.kk_members SET password_hash=hashed_password WHERE id=match_token.member_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',400); END IF;
  -- Revoke every old KK session on password reset.
  DELETE FROM vasra.kk_sessions WHERE member_id=match_token.member_id;
  DELETE FROM vasra.kk_password_resets WHERE member_id=match_token.member_id;
  RETURN jsonb_build_object('ok',true);
 END IF;
 RETURN jsonb_build_object('error',404);
END $fn$;
REVOKE ALL ON FUNCTION public.vasra_kk_password_reset(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_password_reset(text,jsonb,text) TO service_role;
