-- Restrict Google sign-in to pre-existing accounts in the correct portal.
-- Do not change the public KK registration flow or staff login path.
-- Idempotent patch: replaces only the Google action in the existing KK RPC
-- and the relevant Google/2FA branches in the private 2FA RPC.
DO $kk_google_patch$
DECLARE
  function_source text;
  left_boundary integer;
  right_boundary integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO function_source
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='vasra_kk'
    AND pg_get_function_identity_arguments(p.oid)='action text, payload jsonb, session_hash text';
  IF function_source IS NULL THEN RAISE EXCEPTION 'vasra_kk RPC missing'; END IF;
  left_boundary:=strpos(function_source, ' if action=''google'' then');
  right_boundary:=strpos(function_source, ' if action=''logout'' then');
  IF left_boundary=0 OR right_boundary<=left_boundary
    THEN RAISE EXCEPTION 'Unknown vasra_kk Google action structure'; END IF;
  function_source:=left(function_source,left_boundary-1)||
$google_action$
 if action='google' then
  if coalesce(payload->>'sub','') !~ '^[0-9]{5,40}$' or
   coalesce(payload->>'email','') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' or
   coalesce(payload->>'token_hash','') !~ '^[a-f0-9]{64}$'
  then return jsonb_build_object('error',400); end if;

  -- Google email_verified is checked by the server against Google's signed
  -- ID token. This RPC is callable only by the privileged backend role.
  select * into m from vasra.kk_members
   where email=lower(btrim(payload->>'email')) for update;
  if not found then
   return jsonb_build_object('error',404,'reason','not_registered');
  end if;
  if m.google_sub is not null and m.google_sub<>payload->>'sub' then
   return jsonb_build_object('error',403,'reason','different_google_account');
  end if;
  -- Even old production deployments must not mint a KK session when 2FA is ON.
  if coalesce(m.email_2fa_enabled,false) then
   return jsonb_build_object('error',403,'reason','two_factor_required');
  end if;
  -- A verified Google email matching an existing KK email may link to it;
  -- it never creates a new member, profile, or SK staff account.
  if m.google_sub is null then
   update vasra.kk_members
    set google_sub=payload->>'sub',email_verified=true
    where id=m.id and google_sub is null;
  end if;
  insert into vasra.kk_sessions(token_hash,member_id,expires)
   values(payload->>'token_hash',m.id,clock_timestamp()+interval '7 days');
  return jsonb_build_object('ok',true);
 end if;
$google_action$ || substr(function_source,right_boundary);
  EXECUTE function_source;
END $kk_google_patch$;

DO $mfa_google_patch$
DECLARE
  function_source text;
  old_expression text;
  replacement_expression text;
  left_boundary integer;
  right_boundary integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO function_source
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='vasra_email_2fa'
    AND pg_get_function_identity_arguments(p.oid)='action text, payload jsonb, session_hash text';
  IF function_source IS NULL THEN RAISE EXCEPTION '2FA RPC missing'; END IF;

  left_boundary:=strpos(function_source,' if action=''google_enabled'' then');
  right_boundary:=strpos(function_source,' if action=''login_enabled'' then');
  IF left_boundary=0 OR right_boundary<=left_boundary
    THEN RAISE EXCEPTION 'Unknown Google 2FA preflight structure'; END IF;
  function_source:=left(function_source,left_boundary-1)||
$mfa_preflight$
 if action='google_enabled' then
  if kind='staff' then
   select u.email_2fa_enabled into enabled from vasra.users u
    where u.email=lower(btrim(payload->>'email'))
      and u.role in ('sk','chairman')
      and u.disabled_at is null and not u.must_change
      and (u.google_sub is null or u.google_sub=payload->>'sub');
  else
   select u.email_2fa_enabled into enabled from vasra.kk_members u
    where u.email=lower(btrim(payload->>'email'))
      and (u.google_sub is null or u.google_sub=payload->>'sub');
  end if;
  return jsonb_build_object('enabled',coalesce(enabled,false));
 end if;

$mfa_preflight$||substr(function_source,right_boundary);

  left_boundary:=strpos(function_source,' elsif action=''prepare_google'' then');
  right_boundary:=strpos(function_source,' elsif action=''verify'' then');
  IF left_boundary=0 OR right_boundary<=left_boundary
    THEN RAISE EXCEPTION 'Unknown Google 2FA preparation structure'; END IF;
  function_source:=left(function_source,left_boundary-1)||
$mfa_prepare$
 elsif action='prepare_google' then
  if coalesce(payload->>'email','') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$'
   or coalesce(payload->>'sub','') !~ '^[0-9]{5,40}$' then
   return jsonb_build_object('error',400); end if;
  if kind='staff' then
   select id,email,email_2fa_enabled,password into account,addr,enabled,current_credential
    from vasra.users where email=lower(btrim(payload->>'email'))
     and role in ('sk','chairman') and not must_change and disabled_at is null
     and (google_sub is null or google_sub=payload->>'sub');
  else
   select id,email,email_2fa_enabled,password_hash into account,addr,enabled,current_credential
    from vasra.kk_members where email=lower(btrim(payload->>'email'))
     and (google_sub is null or google_sub=payload->>'sub');
  end if;
  if account is null or not coalesce(enabled,false)
   then return jsonb_build_object('error',401); end if;
  purpose_name:='login';

$mfa_prepare$||substr(function_source,right_boundary);

  old_expression:='and (challenge.identity_sub is null or google_sub=challenge.identity_sub))';
  replacement_expression:='and (challenge.identity_sub is null or google_sub is null or google_sub=challenge.identity_sub))';
  IF strpos(function_source,old_expression)=0
    THEN RAISE EXCEPTION 'Unknown KK 2FA verification identity rule'; END IF;
  function_source:=replace(function_source,old_expression,replacement_expression);

  old_expression:='    perform set_config(''vasra.verified_2fa'',''kk:''||challenge.account_id::text,true);';
  replacement_expression:=
$mfa_link$
    -- Link the verified Google identity only AFTER successful email 2FA.
    if challenge.identity_sub is not null then
     update vasra.kk_members set google_sub=challenge.identity_sub,email_verified=true
      where id=challenge.account_id
        and (google_sub is null or google_sub=challenge.identity_sub);
     if not found then return jsonb_build_object('error',401); end if;
    end if;
    perform set_config('vasra.verified_2fa','kk:'||challenge.account_id::text,true);
$mfa_link$;
  IF strpos(function_source,old_expression)=0 THEN
    -- Idempotent if already patched.
    IF strpos(function_source,'Link the verified Google identity only AFTER successful email 2FA.')=0
      THEN RAISE EXCEPTION 'Unknown KK 2FA verification session structure'; END IF;
  ELSE
    function_source:=replace(function_source,old_expression,replacement_expression);
  END IF;
  EXECUTE function_source;
END $mfa_google_patch$;
