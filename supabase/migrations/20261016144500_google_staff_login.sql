-- Google OpenID Connect support for the VASRA staff workspace.
-- STAGED: apply only after approval and testing. No automatic registrations.
BEGIN;
ALTER TABLE vasra.users ADD COLUMN IF NOT EXISTS google_sub text;
CREATE UNIQUE INDEX IF NOT EXISTS vasra_users_google_sub_unique
 ON vasra.users(google_sub) WHERE google_sub IS NOT NULL;
-- The server-side OAuth callback provides a cryptographically verified Google sub/email.
CREATE OR REPLACE FUNCTION public.vasra_google_login(
 action text,payload jsonb DEFAULT '{}'::jsonb,session_hash text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 u vasra.users;
 now_at timestamptz:=clock_timestamp();
BEGIN
 IF action='health' THEN RETURN jsonb_build_object('ready',true); END IF;
 IF action='login' THEN
   IF coalesce(payload->>'email','')='' OR
      coalesce(payload->>'sub','') !~ '^[0-9]{5,40}$' OR
      coalesce(payload->>'token_hash','') !~ '^[0-9a-f]{64}$'
      THEN RETURN jsonb_build_object('error',400); END IF;
   SELECT * INTO u FROM vasra.users
    WHERE lower(email)=lower(payload->>'email') AND role IN ('chairman','sk')
    FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('error',401); END IF;
   -- Staff must complete initial password setup before linking Google.
   IF u.must_change THEN RETURN jsonb_build_object('error',403); END IF;
   IF u.google_sub IS NOT NULL AND u.google_sub <> payload->>'sub'
      THEN RETURN jsonb_build_object('error',401); END IF;
   IF u.google_sub IS NULL THEN
     UPDATE vasra.users SET google_sub=payload->>'sub' WHERE id=u.id;
     INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
       VALUES(u.id,u.name,'google_account_linked',u.id::text,jsonb_build_object('provider','google'));
   END IF;
   DELETE FROM vasra.sessions WHERE expires<now_at;
   INSERT INTO vasra.sessions VALUES(payload->>'token_hash',u.id,now_at+interval '8 hours');
   INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
     VALUES(u.id,u.name,'google_login',u.id::text,jsonb_build_object('provider','google'));
   RETURN jsonb_build_object('id',u.id,'ok',true);
 END IF;
 RETURN jsonb_build_object('error',404);
END $$;
REVOKE ALL ON FUNCTION public.vasra_google_login(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_google_login(text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
