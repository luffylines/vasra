-- SK staff account identity is linked to one authoritative SK Council officer.
-- "Delete" in SK Accounts means deactivate: revoke login, archive public listing,
-- retain historical audit, author attribution, images, KK review and documents.
alter table vasra.users add column if not exists disabled_at timestamptz;
alter table vasra.officials add column if not exists account_user_id uuid unique references vasra.users(id);
create index if not exists vasra_users_disabled_idx on vasra.users(disabled_at) where disabled_at is not null;

create or replace function vasra.sync_sk_account_official()
returns trigger language plpgsql set search_path = '' as $sync_official$
declare match_id uuid; match_count int;
begin
 if new.role <> 'sk' or new.disabled_at is not null then
   update vasra.officials set published=false,archived=true,duty_days='{}'::smallint[]
   where account_user_id=new.id and not archived;
   return new;
 end if;
 -- Keep an already-linked published officer's photo and duty day on edit.
 update vasra.officials set name=new.name,position=new.position,
   archived=false,published=case when archived then true else published end
 where account_user_id=new.id;
 if found then return new;end if;
 select count(*),min(id::text)::uuid into match_count,match_id
 from vasra.officials where account_user_id is null and not archived
  and lower(btrim(name))=lower(btrim(new.name));
 if match_count=1 then
   update vasra.officials set account_user_id=new.id,position=new.position,published=true
   where id=match_id and account_user_id is null;
   if found then return new;end if;
 end if;
 -- Never guess ownership if two council entries have the same name.
 if match_count>1 then return new;end if;
 insert into vasra.officials(name,position,published,archived,account_user_id,duty_days)
 values(new.name,new.position,true,false,new.id,'{}'::smallint[]);
 return new;
end $sync_official$;
revoke all on function vasra.sync_sk_account_official() from public,anon,authenticated;
drop trigger if exists sk_account_officer_sync on vasra.users;
create trigger sk_account_officer_sync after insert or update of name,position,role,disabled_at
on vasra.users for each row execute function vasra.sync_sk_account_official();

-- Initial linking of old accounts to existing Council entries is conservative:
-- link only where a staff name identifies a single unmatched council entry.
with matches as (
 select u.id user_id,min(o.id::text)::uuid official_id,count(*) match_count
 from vasra.users u join vasra.officials o
   on lower(btrim(o.name))=lower(btrim(u.name))
 where u.role='sk' and u.disabled_at is null
   and not o.archived and o.account_user_id is null
 group by u.id
),unique_users as (
 select lower(btrim(name)) n,count(*) c from vasra.users
 where role='sk' and disabled_at is null group by 1
)
update vasra.officials o set account_user_id=m.user_id
from matches m join vasra.users u on u.id=m.user_id
 join unique_users names on names.n=lower(btrim(u.name))
where o.id=m.official_id and m.match_count=1 and names.c=1
 and o.account_user_id is null;

-- Chairman-only RPC; service_role alone can call, but staff session is still checked.
create or replace function public.vasra_staff_accounts(action text,payload jsonb default '{}'::jsonb,session_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $accounts$
declare actor vasra.users; target vasra.users; target_id uuid;
 name_value text; email_value text; new_position text; new_role text;
begin
 select u.* into actor from vasra.sessions s join vasra.users u on u.id=s.user_id
  where s.token=session_hash and s.expires>clock_timestamp()
    and u.role='chairman' and u.disabled_at is null and not u.must_change
  limit 1;
 if not found then return jsonb_build_object('error',403);end if;
 if action='list' then
  return jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(x) order by x.created desc)
   from (select id,name,email,role,position,created from vasra.users
    where disabled_at is null) x),'[]'::jsonb));
 end if;
 if action not in ('update','deactivate') then return jsonb_build_object('error',404);end if;
 begin target_id=(payload->>'id')::uuid;
 exception when invalid_text_representation then return jsonb_build_object('error',400);end;
 select * into target from vasra.users where id=target_id for update;
 if not found then return jsonb_build_object('error',404);end if;
 if target.role='chairman' or target.id=actor.id or target.disabled_at is not null
 then return jsonb_build_object('error',403);end if;
 if action='deactivate' then
  if payload->>'confirm_name' <> target.name then return jsonb_build_object('error',400);end if;
  update vasra.users set disabled_at=clock_timestamp(),role='youth' where id=target.id;
  delete from vasra.sessions where user_id=target.id;
  delete from vasra.account_tokens where user_id=target.id;
  update vasra.officer_contact_details set is_public=false where user_id=target.id;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
    values(actor.id,actor.name,'staff_account_deactivated',target.id::text,
     jsonb_build_object('name',target.name,'previous_role',target.role));
  return jsonb_build_object('ok',true,'deactivated',true);
 end if;
 name_value=btrim(coalesce(payload->>'name',''));
 email_value=lower(btrim(coalesce(payload->>'email','')));
 new_position=coalesce(payload->>'position','');
 new_role=coalesce(payload->>'role','');
 if length(name_value) not between 2 and 100 or name_value ~ '[<>[:cntrl:]]' or
    length(email_value) not between 5 and 254 or
    email_value !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' or
    new_position not in ('kagawad','treasurer','secretary') or new_role not in ('sk','youth')
 then return jsonb_build_object('error',400);end if;
 if exists(select 1 from vasra.users where lower(email)=email_value and id<>target.id)
 then return jsonb_build_object('error',409);end if;
 update vasra.users set name=name_value,email=email_value,position=new_position,role=new_role
 where id=target.id;
 if target.role<>new_role or target.email<>email_value then
   delete from vasra.sessions where user_id=target.id;
   delete from vasra.account_tokens where user_id=target.id;
 end if;
 insert into vasra.audit(actor_id,actor_name,action,entity,details)
  values(actor.id,actor.name,'staff_account_updated',target.id::text,
   jsonb_build_object('before_name',target.name,'after_name',name_value,
    'before_position',target.position,'after_position',new_position,
    'before_role',target.role,'after_role',new_role,
    'email_changed',target.email<>email_value));
 return jsonb_build_object('ok',true);
end $accounts$;
revoke all on function public.vasra_staff_accounts(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_staff_accounts(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
