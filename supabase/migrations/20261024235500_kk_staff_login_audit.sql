-- SK VASRA: record only successful authentication and new KK registrations.
-- This migration is additive, and does not modify accounts, sessions, or existing audit rows.
-- Keep public/anon/authenticated away from both the private schema and trigger function.
create or replace function vasra.audit_auth_success()
returns trigger
language plpgsql
set search_path = ''
as $vasra_auth$
declare
 actor_label text;
 member_name text;
 role_label text;
 method_label text;
begin
 if tg_table_schema <> 'vasra' or tg_op <> 'INSERT' then
  raise exception 'Invalid audit trigger binding';
 end if;

 if tg_table_name = 'kk_members' then
  member_name := trim(concat_ws(' ', nullif(new.first_name,''), nullif(new.last_name,'')));
  actor_label := case when length(member_name)>0
    then 'KK • '||left(member_name,160) else 'KK account (profile pending)' end;
  method_label := case when new.google_sub is null then 'email' else 'google' end;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
  values(new.id, actor_label, 'kk_registered', new.id::text,
    jsonb_build_object('account_type','kk','method',method_label));
  return new;
 end if;

 if tg_table_name = 'kk_sessions' then
  select trim(concat_ws(' ',nullif(m.first_name,''),nullif(m.last_name,''))),
    case when m.google_sub is null then 'email' else 'google' end
   into member_name,method_label
   from vasra.kk_members m where m.id=new.member_id;
  actor_label := case when length(member_name)>0
    then 'KK • '||left(member_name,160) else 'KK account (profile pending)' end;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
  values(new.member_id, actor_label, 'kk_login', new.member_id::text,
    jsonb_build_object('account_type','kk','method',method_label));
  return new;
 end if;

 if tg_table_name = 'sessions' then
  select u.name,u.role into member_name,role_label
   from vasra.users u where u.id=new.user_id;
  if member_name is null then
   raise exception 'Missing staff user for successful auth audit';
  end if;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
  values(new.user_id, 'SK Staff • '||left(member_name,160), 'staff_login', new.user_id::text,
    jsonb_build_object('account_type','staff','role',role_label));
  return new;
 end if;

 raise exception 'Unexpected auth audit trigger source: %',tg_table_name;
end;
$vasra_auth$;

revoke all on function vasra.audit_auth_success() from public,anon,authenticated;
grant execute on function vasra.audit_auth_success() to service_role;

create trigger vasra_kk_register_audit
after insert on vasra.kk_members
for each row execute function vasra.audit_auth_success();

create trigger vasra_kk_login_audit
after insert on vasra.kk_sessions
for each row execute function vasra.audit_auth_success();

create trigger vasra_staff_login_audit
after insert on vasra.sessions
for each row execute function vasra.audit_auth_success();
