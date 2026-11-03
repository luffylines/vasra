-- SK VASRA optional email 2FA. Apply through the reviewed Supabase migration workflow.
-- Server-only RPC, hashed OTPs, atomic verification and session-level enforcement.
begin;
alter table vasra.users add column if not exists email_2fa_enabled boolean not null default false;
alter table vasra.kk_members add column if not exists email_2fa_enabled boolean not null default false;
create table if not exists vasra.email_2fa_challenges (
 id uuid primary key,
 account_kind text not null check (account_kind in ('staff','kk')),
 account_id uuid not null,
 purpose text not null check (purpose in ('enable','disable','login')),
 code_hash text not null,
 credential_hash text,
 identity_sub text,
 expires_at timestamptz not null,
 attempts integer not null default 0,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists email_2fa_challenges_expiry on vasra.email_2fa_challenges(expires_at);
create index if not exists email_2fa_challenges_account on vasra.email_2fa_challenges(account_kind,account_id);
alter table vasra.email_2fa_challenges enable row level security;
revoke all on vasra.email_2fa_challenges from public,anon,authenticated;
grant select,insert,update,delete on vasra.email_2fa_challenges to service_role;
-- A second-factor-enabled account cannot receive a full login session from
-- an older password, Google, reset or provisioning endpoint. Only a verified
-- one-time challenge is permitted to create a session.
create or replace function vasra.enforce_email_2fa_on_session()
returns trigger language plpgsql security invoker set search_path='' as $$
declare enabled boolean; expected text;
begin
 if tg_table_name='sessions' then
  select email_2fa_enabled into enabled from vasra.users where id=new.user_id;
  expected:='staff:'||new.user_id::text;
 else
  select email_2fa_enabled into enabled from vasra.kk_members where id=new.member_id;
  expected:='kk:'||new.member_id::text;
 end if;
 if coalesce(enabled,false) and current_setting('vasra.verified_2fa',true) is distinct from expected then
  raise exception using errcode='42501',message='Email 2FA verification required';
 end if;
 return new;
end $$;
drop trigger if exists enforce_email_2fa_staff on vasra.sessions;
create trigger enforce_email_2fa_staff before insert on vasra.sessions
 for each row execute function vasra.enforce_email_2fa_on_session();
drop trigger if exists enforce_email_2fa_kk on vasra.kk_sessions;
create trigger enforce_email_2fa_kk before insert on vasra.kk_sessions
 for each row execute function vasra.enforce_email_2fa_on_session();

create or replace function public.vasra_email_2fa(
 action text,payload jsonb default '{}'::jsonb,session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 kind text:=payload->>'kind'; account uuid; addr text; enabled boolean;
 current_credential text; challenge vasra.email_2fa_challenges;
 now_at timestamptz:=clock_timestamp(); purpose_name text;
 token_value text:=payload->>'token_hash'; result jsonb;
 staff_account vasra.users;
begin
 if kind not in ('staff','kk') then return jsonb_build_object('error',400); end if;
 if action='password_change' then
  if kind<>'staff' or token_value is null or length(token_value)<40 then
   return jsonb_build_object('error',400); end if;
  select u.* into staff_account
   from vasra.users u join vasra.sessions se on se.user_id=u.id
   where se.token=session_hash and se.expires>now_at and u.role in ('sk','chairman')
   for update of u;
  if not staff_account.email_2fa_enabled or
    staff_account.password is distinct from payload->>'expected_credential' or
    length(coalesce(payload->>'new_hash',''))<40
   then return jsonb_build_object('error',403); end if;
  update vasra.users set password=payload->>'new_hash',must_change=false
   where id=staff_account.id returning * into staff_account;
  delete from vasra.sessions where user_id=staff_account.id;
  perform set_config('vasra.verified_2fa','staff:'||staff_account.id::text,true);
  insert into vasra.sessions(token,user_id,expires)
   values(token_value,staff_account.id,now_at+interval '7 days');
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
   values(staff_account.id,staff_account.name,'password_changed',staff_account.id::text,'{}'::jsonb);
  return to_jsonb(staff_account)-'password';
 end if;
 if action='google_enabled' then
  if kind='staff' then
   select email_2fa_enabled into enabled from vasra.users
    where email=lower(btrim(payload->>'email')) and role in ('sk','chairman');
  else
   select email_2fa_enabled into enabled from vasra.kk_members
    where email=lower(btrim(payload->>'email')) and google_sub=payload->>'sub';
  end if;
  return jsonb_build_object('enabled',coalesce(enabled,false));
 end if;
 if action='login_enabled' then
  if kind='staff' then
   select email_2fa_enabled into enabled from vasra.users where id=nullif(payload->>'account_id','')::uuid;
  else
   select email_2fa_enabled into enabled from vasra.kk_members where id=nullif(payload->>'account_id','')::uuid;
  end if;
  return jsonb_build_object('enabled',coalesce(enabled,false));
 end if;
 if action in ('status','prepare_enable','prepare_disable') then
  if kind='staff' then
   select u.id,u.email,u.email_2fa_enabled,u.password into account,addr,enabled,current_credential
   from vasra.users u join vasra.sessions s on s.user_id=u.id
   where s.token=session_hash and s.expires>now_at and u.role in ('sk','chairman');
  else
   select u.id,u.email,u.email_2fa_enabled,u.password_hash into account,addr,enabled,current_credential
   from vasra.kk_members u join vasra.kk_sessions s on s.member_id=u.id
   where s.token_hash=session_hash and s.expires>now_at;
  end if;
  if account is null then return jsonb_build_object('error',401); end if;
  if action='status' then return jsonb_build_object('enabled',enabled); end if;
  if action='prepare_enable' and current_credential is null then
   return jsonb_build_object('error',409,'reason','password_required');
  end if;
  if (action='prepare_enable' and enabled) or (action='prepare_disable' and not enabled)
   then return jsonb_build_object('error',409); end if;
  purpose_name:=case when action='prepare_enable' then 'enable' else 'disable' end;
 elsif action='prepare_login' then
  account:=nullif(payload->>'account_id','')::uuid;
  if account is null then return jsonb_build_object('error',400); end if;
  if kind='staff' then
   select email,email_2fa_enabled,password into addr,enabled,current_credential
   from vasra.users where id=account and role in ('sk','chairman');
  else
   select email,email_2fa_enabled,password_hash into addr,enabled,current_credential
   from vasra.kk_members where id=account;
  end if;
  if not coalesce(enabled,false) or current_credential is distinct from payload->>'expected_credential'
   then return jsonb_build_object('error',401); end if;
  purpose_name:='login';
 elsif action='prepare_google' then
  if coalesce(payload->>'email','') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}
  select * into challenge from vasra.email_2fa_challenges
   where id=nullif(payload->>'id','')::uuid and account_kind=kind for update;
  if not found then return jsonb_build_object('error',401); end if;
  if challenge.expires_at<=now_at or challenge.attempts>=5 then
   delete from vasra.email_2fa_challenges where id=challenge.id;
   return jsonb_build_object('error',401);
  end if;
  if challenge.purpose<>'login' then
   if kind='staff' then
    select u.id into account from vasra.users u join vasra.sessions s on s.user_id=u.id
     where s.token=session_hash and s.expires>now_at;
   else
    select u.id into account from vasra.kk_members u join vasra.kk_sessions s on s.member_id=u.id
     where s.token_hash=session_hash and s.expires>now_at;
   end if;
   if account is distinct from challenge.account_id then return jsonb_build_object('error',403); end if;
  end if;
  update vasra.email_2fa_challenges set attempts=attempts+1 where id=challenge.id;
  if challenge.code_hash is distinct from payload->>'code_hash' then
   return jsonb_build_object('error',401,'remaining',4-challenge.attempts);
  end if;
  if challenge.purpose='login' then
   if token_value is null or length(token_value)<40 then return jsonb_build_object('error',400); end if;
   if kind='staff' then
    if not exists(select 1 from vasra.users where id=challenge.account_id and
     role in ('sk','chairman') and email_2fa_enabled and password=challenge.credential_hash
     and (challenge.identity_sub is null or google_sub is null or google_sub=challenge.identity_sub))
     then return jsonb_build_object('error',401); end if;
    if challenge.identity_sub is not null then
      update vasra.users set google_sub=challenge.identity_sub
       where id=challenge.account_id and google_sub is null;
    end if;
    perform set_config('vasra.verified_2fa','staff:'||challenge.account_id::text,true);
    insert into vasra.sessions(token,user_id,expires)
      values(token_value,challenge.account_id,now_at+interval '7 days');
   else
    if not exists(select 1 from vasra.kk_members where id=challenge.account_id and
     email_2fa_enabled and password_hash=challenge.credential_hash)
     then return jsonb_build_object('error',401); end if;
    perform set_config('vasra.verified_2fa','kk:'||challenge.account_id::text,true);
    insert into vasra.kk_sessions(token_hash,member_id,expires)
      values(token_value,challenge.account_id,now_at+interval '7 days');
   end if;
  else
   if kind='staff' then
    update vasra.users set email_2fa_enabled=(challenge.purpose='enable')
     where id=challenge.account_id;
    if challenge.purpose in ('enable','disable') then
     delete from vasra.sessions where user_id=challenge.account_id and token<>session_hash;
    end if;
   else
    update vasra.kk_members set email_2fa_enabled=(challenge.purpose='enable')
     where id=challenge.account_id;
    if challenge.purpose in ('enable','disable') then
     delete from vasra.kk_sessions where member_id=challenge.account_id and token_hash<>session_hash;
    end if;
   end if;
  end if;
  delete from vasra.email_2fa_challenges where id=challenge.id;
  return jsonb_build_object('ok',true,'enabled',challenge.purpose='enable',
     'login',challenge.purpose='login');
 elsif action='abort' then
  delete from vasra.email_2fa_challenges
   where id=nullif(payload->>'id','')::uuid and account_kind=kind;
  return jsonb_build_object('ok',true);
 else return jsonb_build_object('error',400);
 end if;
 if coalesce(payload->>'id','') !~ '^[0-9a-f-]{36}$'
   or coalesce(payload->>'code_hash','') !~ '^[0-9a-f]{64}$'
   then return jsonb_build_object('error',400); end if;
 delete from vasra.email_2fa_challenges where expires_at<now_at;
 delete from vasra.email_2fa_challenges where account_kind=kind and account_id=account;
 insert into vasra.email_2fa_challenges(id,account_kind,account_id,purpose,code_hash,credential_hash,identity_sub,expires_at)
 values((payload->>'id')::uuid,kind,account,purpose_name,payload->>'code_hash',
   case when purpose_name='login' then current_credential else null end,
   case when action='prepare_google' then payload->>'sub' else null end,
   now_at+interval '5 minutes');
 return jsonb_build_object('ok',true,'delivery_email',addr);
end $$;
revoke all on function public.vasra_email_2fa(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_email_2fa(text,jsonb,text) to service_role;
commit;

   or coalesce(payload->>'sub','') !~ '^[0-9]{5,40}
  select * into challenge from vasra.email_2fa_challenges
   where id=nullif(payload->>'id','')::uuid and account_kind=kind for update;
  if not found then return jsonb_build_object('error',401); end if;
  if challenge.expires_at<=now_at or challenge.attempts>=5 then
   delete from vasra.email_2fa_challenges where id=challenge.id;
   return jsonb_build_object('error',401);
  end if;
  if challenge.purpose<>'login' then
   if kind='staff' then
    select u.id into account from vasra.users u join vasra.sessions s on s.user_id=u.id
     where s.token=session_hash and s.expires>now_at;
   else
    select u.id into account from vasra.kk_members u join vasra.kk_sessions s on s.member_id=u.id
     where s.token_hash=session_hash and s.expires>now_at;
   end if;
   if account is distinct from challenge.account_id then return jsonb_build_object('error',403); end if;
  end if;
  update vasra.email_2fa_challenges set attempts=attempts+1 where id=challenge.id;
  if challenge.code_hash is distinct from payload->>'code_hash' then
   return jsonb_build_object('error',401,'remaining',4-challenge.attempts);
  end if;
  if challenge.purpose='login' then
   if token_value is null or length(token_value)<40 then return jsonb_build_object('error',400); end if;
   if kind='staff' then
    if not exists(select 1 from vasra.users where id=challenge.account_id and
     role in ('sk','chairman') and email_2fa_enabled and password=challenge.credential_hash)
     then return jsonb_build_object('error',401); end if;
    perform set_config('vasra.verified_2fa','staff:'||challenge.account_id::text,true);
    insert into vasra.sessions(token,user_id,expires)
      values(token_value,challenge.account_id,now_at+interval '7 days');
   else
    if not exists(select 1 from vasra.kk_members where id=challenge.account_id and
     email_2fa_enabled and password_hash=challenge.credential_hash)
     then return jsonb_build_object('error',401); end if;
    perform set_config('vasra.verified_2fa','kk:'||challenge.account_id::text,true);
    insert into vasra.kk_sessions(token_hash,member_id,expires)
      values(token_value,challenge.account_id,now_at+interval '7 days');
   end if;
  else
   if kind='staff' then
    update vasra.users set email_2fa_enabled=(challenge.purpose='enable')
     where id=challenge.account_id;
    if challenge.purpose in ('enable','disable') then
     delete from vasra.sessions where user_id=challenge.account_id and token<>session_hash;
    end if;
   else
    update vasra.kk_members set email_2fa_enabled=(challenge.purpose='enable')
     where id=challenge.account_id;
    if challenge.purpose in ('enable','disable') then
     delete from vasra.kk_sessions where member_id=challenge.account_id and token_hash<>session_hash;
    end if;
   end if;
  end if;
  delete from vasra.email_2fa_challenges where id=challenge.id;
  return jsonb_build_object('ok',true,'enabled',challenge.purpose='enable',
     'login',challenge.purpose='login');
 elsif action='abort' then
  delete from vasra.email_2fa_challenges
   where id=nullif(payload->>'id','')::uuid and account_kind=kind;
  return jsonb_build_object('ok',true);
 else return jsonb_build_object('error',400);
 end if;
 if coalesce(payload->>'id','') !~ '^[0-9a-f-]{36}$'
   or coalesce(payload->>'code_hash','') !~ '^[0-9a-f]{64}$'
   then return jsonb_build_object('error',400); end if;
 delete from vasra.email_2fa_challenges where expires_at<now_at;
 delete from vasra.email_2fa_challenges where account_kind=kind and account_id=account;
 insert into vasra.email_2fa_challenges(id,account_kind,account_id,purpose,code_hash,credential_hash,expires_at)
 values((payload->>'id')::uuid,kind,account,purpose_name,payload->>'code_hash',
   case when purpose_name='login' then current_credential else null end,now_at+interval '5 minutes');
 return jsonb_build_object('ok',true,'delivery_email',addr);
end $$;
revoke all on function public.vasra_email_2fa(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_email_2fa(text,jsonb,text) to service_role;
commit;

   then return jsonb_build_object('error',400); end if;
  if kind='staff' then
   select id,email,email_2fa_enabled,password into account,addr,enabled,current_credential
    from vasra.users where email=lower(btrim(payload->>'email'))
     and role in ('sk','chairman') and not must_change
     and (google_sub is null or google_sub=payload->>'sub');
  else
   select id,email,email_2fa_enabled,password_hash into account,addr,enabled,current_credential
    from vasra.kk_members where email=lower(btrim(payload->>'email'))
     and google_sub=payload->>'sub';
  end if;
  if account is null or not coalesce(enabled,false) then
   return jsonb_build_object('error',401); end if;
  purpose_name:='login';
 elsif action='verify' then
  select * into challenge from vasra.email_2fa_challenges
   where id=nullif(payload->>'id','')::uuid and account_kind=kind for update;
  if not found then return jsonb_build_object('error',401); end if;
  if challenge.expires_at<=now_at or challenge.attempts>=5 then
   delete from vasra.email_2fa_challenges where id=challenge.id;
   return jsonb_build_object('error',401);
  end if;
  if challenge.purpose<>'login' then
   if kind='staff' then
    select u.id into account from vasra.users u join vasra.sessions s on s.user_id=u.id
     where s.token=session_hash and s.expires>now_at;
   else
    select u.id into account from vasra.kk_members u join vasra.kk_sessions s on s.member_id=u.id
     where s.token_hash=session_hash and s.expires>now_at;
   end if;
   if account is distinct from challenge.account_id then return jsonb_build_object('error',403); end if;
  end if;
  update vasra.email_2fa_challenges set attempts=attempts+1 where id=challenge.id;
  if challenge.code_hash is distinct from payload->>'code_hash' then
   return jsonb_build_object('error',401,'remaining',4-challenge.attempts);
  end if;
  if challenge.purpose='login' then
   if token_value is null or length(token_value)<40 then return jsonb_build_object('error',400); end if;
   if kind='staff' then
    if not exists(select 1 from vasra.users where id=challenge.account_id and
     role in ('sk','chairman') and email_2fa_enabled and password=challenge.credential_hash)
     then return jsonb_build_object('error',401); end if;
    perform set_config('vasra.verified_2fa','staff:'||challenge.account_id::text,true);
    insert into vasra.sessions(token,user_id,expires)
      values(token_value,challenge.account_id,now_at+interval '7 days');
   else
    if not exists(select 1 from vasra.kk_members where id=challenge.account_id and
     email_2fa_enabled and password_hash=challenge.credential_hash)
     then return jsonb_build_object('error',401); end if;
    perform set_config('vasra.verified_2fa','kk:'||challenge.account_id::text,true);
    insert into vasra.kk_sessions(token_hash,member_id,expires)
      values(token_value,challenge.account_id,now_at+interval '7 days');
   end if;
  else
   if kind='staff' then
    update vasra.users set email_2fa_enabled=(challenge.purpose='enable')
     where id=challenge.account_id;
    if challenge.purpose in ('enable','disable') then
     delete from vasra.sessions where user_id=challenge.account_id and token<>session_hash;
    end if;
   else
    update vasra.kk_members set email_2fa_enabled=(challenge.purpose='enable')
     where id=challenge.account_id;
    if challenge.purpose in ('enable','disable') then
     delete from vasra.kk_sessions where member_id=challenge.account_id and token_hash<>session_hash;
    end if;
   end if;
  end if;
  delete from vasra.email_2fa_challenges where id=challenge.id;
  return jsonb_build_object('ok',true,'enabled',challenge.purpose='enable',
     'login',challenge.purpose='login');
 elsif action='abort' then
  delete from vasra.email_2fa_challenges
   where id=nullif(payload->>'id','')::uuid and account_kind=kind;
  return jsonb_build_object('ok',true);
 else return jsonb_build_object('error',400);
 end if;
 if coalesce(payload->>'id','') !~ '^[0-9a-f-]{36}$'
   or coalesce(payload->>'code_hash','') !~ '^[0-9a-f]{64}$'
   then return jsonb_build_object('error',400); end if;
 delete from vasra.email_2fa_challenges where expires_at<now_at;
 delete from vasra.email_2fa_challenges where account_kind=kind and account_id=account;
 insert into vasra.email_2fa_challenges(id,account_kind,account_id,purpose,code_hash,credential_hash,expires_at)
 values((payload->>'id')::uuid,kind,account,purpose_name,payload->>'code_hash',
   case when purpose_name='login' then current_credential else null end,now_at+interval '5 minutes');
 return jsonb_build_object('ok',true,'delivery_email',addr);
end $$;
revoke all on function public.vasra_email_2fa(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_email_2fa(text,jsonb,text) to service_role;
commit;
