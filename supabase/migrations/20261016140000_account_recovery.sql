-- VASRA account recovery and verified email changes.
-- STAGED ONLY: production activation requires approval, Resend verified sender and environment values.
BEGIN;
CREATE TABLE IF NOT EXISTS vasra.account_tokens (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES vasra.users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('reset_password','change_email')),
 new_email text,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS vasra_account_tokens_user_purpose ON vasra.account_tokens(user_id,purpose);
CREATE INDEX IF NOT EXISTS vasra_account_tokens_expiry ON vasra.account_tokens(expires_at);
ALTER TABLE vasra.account_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE vasra.account_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE vasra.account_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.vasra_account(action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT null)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 stamp timestamptz:=clock_timestamp();
 u vasra.users;
 tok vasra.account_tokens;
 target vasra.users;
 cleaned_email text;
BEGIN
 IF action='health' THEN RETURN jsonb_build_object('ready',true); END IF;
 -- Avoid token buildup. Only service_role can call this function.
 DELETE FROM vasra.account_tokens WHERE expires_at<stamp;
 IF action='email_prepare' THEN
   SELECT usr.* INTO u FROM vasra.users usr JOIN vasra.sessions s ON s.user_id=usr.id
      WHERE s.token=session_hash AND s.expires>stamp AND usr.role IN ('chairman','sk') AND NOT usr.must_change;
   IF u.id IS NULL THEN RETURN jsonb_build_object('error',401); END IF;
   cleaned_email=lower(btrim(payload->>'email'));
   IF cleaned_email IS NULL OR cleaned_email=u.email OR cleaned_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      THEN RETURN jsonb_build_object('error',400); END IF;
   IF EXISTS(SELECT 1 FROM vasra.users WHERE email=cleaned_email AND id<>u.id) THEN RETURN jsonb_build_object('error',409); END IF;
   DELETE FROM vasra.account_tokens WHERE user_id=u.id AND purpose='change_email';
   INSERT INTO vasra.account_tokens(token_hash,user_id,purpose,new_email,expires_at)
      VALUES(payload->>'token_hash',u.id,'change_email',cleaned_email,stamp+interval '15 minutes');
   RETURN jsonb_build_object('ok',true);
 END IF;
 IF action='email_confirm' THEN
   SELECT * INTO tok FROM vasra.account_tokens
     WHERE token_hash=payload->>'token_hash' AND purpose='change_email' AND expires_at>stamp FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('error',400); END IF;
   SELECT * INTO u FROM vasra.users WHERE id=tok.user_id AND role IN ('chairman','sk') FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('error',400); END IF;
   IF EXISTS(SELECT 1 FROM vasra.users WHERE email=tok.new_email AND id<>u.id) THEN RETURN jsonb_build_object('error',409); END IF;
   UPDATE vasra.users SET email=tok.new_email WHERE id=u.id;
   DELETE FROM vasra.account_tokens WHERE user_id=u.id;
   DELETE FROM vasra.sessions WHERE user_id=u.id;
   INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
      VALUES(u.id,u.name,'email_changed',u.id::text,jsonb_build_object('verified_at',stamp));
   RETURN jsonb_build_object('ok',true);
 END IF;
 IF action='reset_prepare' THEN
   cleaned_email=lower(btrim(payload->>'email'));
   SELECT * INTO u FROM vasra.users WHERE email=cleaned_email AND role IN ('chairman','sk');
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
   DELETE FROM vasra.account_tokens WHERE user_id=u.id AND purpose='reset_password';
   INSERT INTO vasra.account_tokens(token_hash,user_id,purpose,expires_at)
     VALUES(payload->>'token_hash',u.id,'reset_password',stamp+interval '30 minutes');
   RETURN jsonb_build_object('ok',true,'delivery_email',u.email);
 END IF;
 IF action='reset_confirm' THEN
   SELECT * INTO tok FROM vasra.account_tokens
     WHERE token_hash=payload->>'token_hash' AND purpose='reset_password' AND expires_at>stamp FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('error',400); END IF;
   SELECT * INTO u FROM vasra.users WHERE id=tok.user_id AND role IN ('chairman','sk') FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('error',400); END IF;
   UPDATE vasra.users SET password=payload->>'password',must_change=false WHERE id=u.id;
   DELETE FROM vasra.account_tokens WHERE user_id=u.id;
   DELETE FROM vasra.sessions WHERE user_id=u.id;
   INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
      VALUES(u.id,u.name,'password_reset',u.id::text,jsonb_build_object('at',stamp));
   RETURN jsonb_build_object('ok',true);
 END IF;
 IF action='cancel_token' THEN
   -- Cancels only a failed dispatch token; this action is never exposed in a user-facing endpoint.
   DELETE FROM vasra.account_tokens WHERE token_hash=payload->>'token_hash';
   RETURN jsonb_build_object('ok',true);
 END IF;
 RETURN jsonb_build_object('error',404);
END $$;
REVOKE ALL ON FUNCTION public.vasra_account(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_account(text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
