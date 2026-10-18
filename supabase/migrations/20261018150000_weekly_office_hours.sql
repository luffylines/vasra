-- Chairman-managed weekly office hours + duty officer assignments.
-- STAGED after 20261018140000_official_photos_duty_roster.sql.
-- Replaces hardcoded 9:00–18:00 while preserving default hours and immutable audit history.
begin;
create table if not exists vasra.duty_hours (
 weekday smallint primary key check(weekday between 1 and 7),
 opens time without time zone not null default '09:00',
 closes time without time zone not null default '18:00',
 updated_by uuid references vasra.users(id),
 updated_at timestamptz not null default clock_timestamp(),
 constraint vasra_duty_hours_valid check(opens<closes)
);
insert into vasra.duty_hours(weekday,opens,closes)
select d,'09:00'::time,'18:00'::time from generate_series(1,7) as d
on conflict(weekday) do nothing;
alter table vasra.duty_hours enable row level security;
revoke all on table vasra.duty_hours from public,anon,authenticated;
grant select,insert,update on table vasra.duty_hours to service_role;

create or replace function public.vasra_duty_management(action text,payload jsonb default '{}'::jsonb,session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor vasra.users; day_number int; opening time; closing time; wanted uuid[]; current_ids uuid[]; approved_count integer;
begin
 if action='public' then
  return jsonb_build_object('days',coalesce((select jsonb_agg(jsonb_build_object(
   'weekday',h.weekday,'open_time',to_char(h.opens,'HH24:MI'),'close_time',to_char(h.closes,'HH24:MI'))
   order by h.weekday) from vasra.duty_hours h),'[]'::jsonb));
 end if;
 select u.* into actor from vasra.users u join vasra.sessions s on s.user_id=u.id
  where s.token=session_hash and s.expires>clock_timestamp() and not u.must_change limit 1;
 if actor.id is null or actor.role<>'chairman' then return jsonb_build_object('error',403); end if;
 if action='manage' then
  return jsonb_build_object('days',coalesce((select jsonb_agg(jsonb_build_object(
   'weekday',h.weekday,'open_time',to_char(h.opens,'HH24:MI'),'close_time',to_char(h.closes,'HH24:MI'))
   order by h.weekday) from vasra.duty_hours h),'[]'::jsonb));
 end if;
 if action='save_hours' then
  day_number:=(payload->>'weekday')::integer;
  if day_number not between 1 and 7
   or coalesce(payload->>'open_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]
 day_number:=(payload->>'weekday')::integer;
 if day_number not between 1 and 7
  or coalesce(payload->>'open_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or coalesce(payload->>'close_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or jsonb_typeof(payload->'official_ids') is distinct from 'array'
 then return jsonb_build_object('error',400); end if;
 opening:=(payload->>'open_time')::time;
 closing:=(payload->>'close_time')::time;
 if opening>=closing then return jsonb_build_object('error',400); end if;
 if jsonb_array_length(payload->'official_ids')>24 then return jsonb_build_object('error',400); end if;
 if exists(select 1 from jsonb_array_elements_text(payload->'official_ids') x
   where x.value !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
 then return jsonb_build_object('error',400); end if;
 select coalesce(array_agg(distinct x.value::uuid),'{}'::uuid[]) into wanted
 from jsonb_array_elements_text(payload->'official_ids') x;
 select count(*) into approved_count from vasra.officials o
 where o.id=any(wanted) and o.published and not o.archived;
 if approved_count<>cardinality(wanted) then return jsonb_build_object('error',400,'reason','officers_must_be_published'); end if;
 -- Only the selected day's membership is modified; other day assignments remain intact.
 select coalesce(array_agg(o.id),'{}'::uuid[]) into current_ids from vasra.officials o
 where day_number=any(o.duty_days) and not o.archived;
 update vasra.officials o set duty_days=array_remove(o.duty_days,day_number::smallint),updated_by=actor.id
 where day_number=any(o.duty_days) and not o.archived and not(o.id=any(wanted));
 update vasra.officials o set duty_days=(
  select array[day_number::smallint]
 ),updated_by=actor.id
 where o.id=any(wanted) and not o.archived and not(day_number=any(o.duty_days));
 insert into vasra.duty_hours(weekday,opens,closes,updated_by)
 values(day_number,opening,closing,actor.id)
 on conflict(weekday) do update set opens=excluded.opens,closes=excluded.closes,
 updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into vasra.audit(actor_id,actor_name,action,entity,details)
 values(actor.id,actor.name,'duty_weekday_updated',day_number::text,
 jsonb_build_object('weekday',day_number,'start_time',opening,'end_time',closing,
 'previous_officer_ids',current_ids,'new_officer_ids',wanted));
 return jsonb_build_object('ok',true,'weekday',day_number);
end $$;
revoke all on function public.vasra_duty_management(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_duty_management(text,jsonb,text) to service_role;

-- Update today's office status using the official published hours.
create or replace function public.vasra_duty(action text,payload jsonb default '{}'::jsonb,session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date:=(clock_timestamp() at time zone 'Asia/Manila')::date;
 weekday integer:=extract(isodow from (clock_timestamp() at time zone 'Asia/Manila'));
 actor vasra.users; mode_value text; assigned_names text[]; has_schedule boolean;
 start_at time; stop_at time;
begin
 select h.opens,h.closes into start_at,stop_at from vasra.duty_hours h where h.weekday=weekday;
 start_at:=coalesce(start_at,'09:00'::time);stop_at:=coalesce(stop_at,'18:00'::time);
 if action='status' then
  select d.mode into mode_value from vasra.duty_overrides d where d.day=today;
  return jsonb_build_object('date',today,'mode',coalesce(mode_value,'auto'),
   'open_time',to_char(start_at,'HH24:MI'),'close_time',to_char(stop_at,'HH24:MI'));
 end if;
 if action<>'set' then return jsonb_build_object('error',404); end if;
 select u.* into actor from vasra.sessions s join vasra.users u on u.id=s.user_id
 where s.token=session_hash and s.expires>clock_timestamp() limit 1;
 if actor.id is null or actor.must_change or actor.role not in ('chairman','sk') then return jsonb_build_object('error',403); end if;
 if actor.role='sk' then
  select exists(select 1 from vasra.officials where published and not archived and cardinality(duty_days)>0) into has_schedule;
  if has_schedule then
   if not exists(select 1 from vasra.officials o where o.published and not o.archived
    and weekday=any(o.duty_days) and lower(trim(o.name))=lower(trim(actor.name)))
   then return jsonb_build_object('error',403,'reason','not_assigned_today'); end if;
  else
   assigned_names:=case weekday when 1 then array['gel bergonio']
    when 2 then array['ernest bragais','kristine de ocampo']
    when 3 then array['sherwin estanislao'] when 4 then array['rembert natividad']
    when 5 then array['arvin capiral'] when 6 then array['kath irag']
    when 7 then array['roland reyes'] end;
   if lower(trim(actor.name))<>all(assigned_names) then
    return jsonb_build_object('error',403,'reason','not_assigned_today'); end if;
  end if;
 end if;
 if payload->>'mode' not in ('closed','auto') then return jsonb_build_object('error',400); end if;
 insert into vasra.duty_overrides(day,mode,updated_by,updated_at)
 values(today,payload->>'mode',actor.id,clock_timestamp())
 on conflict(day) do update set mode=excluded.mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into vasra.audit(actor_id,actor_name,action,entity,details)
 values(actor.id,actor.name,'duty_status_changed',today::text,jsonb_build_object('mode',payload->>'mode'));
 return jsonb_build_object('date',today,'mode',payload->>'mode',
 'open_time',to_char(start_at,'HH24:MI'),'close_time',to_char(stop_at,'HH24:MI'));
end $$;
revoke all on function public.vasra_duty(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_duty(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;

   or coalesce(payload->>'close_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]
 day_number:=(payload->>'weekday')::integer;
 if day_number not between 1 and 7
  or coalesce(payload->>'open_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or coalesce(payload->>'close_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or jsonb_typeof(payload->'official_ids') is distinct from 'array'
 then return jsonb_build_object('error',400); end if;
 opening:=(payload->>'open_time')::time;
 closing:=(payload->>'close_time')::time;
 if opening>=closing then return jsonb_build_object('error',400); end if;
 if jsonb_array_length(payload->'official_ids')>24 then return jsonb_build_object('error',400); end if;
 if exists(select 1 from jsonb_array_elements_text(payload->'official_ids') x
   where x.value !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
 then return jsonb_build_object('error',400); end if;
 select coalesce(array_agg(distinct x.value::uuid),'{}'::uuid[]) into wanted
 from jsonb_array_elements_text(payload->'official_ids') x;
 select count(*) into approved_count from vasra.officials o
 where o.id=any(wanted) and o.published and not o.archived;
 if approved_count<>cardinality(wanted) then return jsonb_build_object('error',400,'reason','officers_must_be_published'); end if;
 -- Only the selected day's membership is modified; other day assignments remain intact.
 select coalesce(array_agg(o.id),'{}'::uuid[]) into current_ids from vasra.officials o
 where day_number=any(o.duty_days) and not o.archived;
 update vasra.officials o set duty_days=array_remove(o.duty_days,day_number::smallint),updated_by=actor.id
 where day_number=any(o.duty_days) and not o.archived and not(o.id=any(wanted));
 update vasra.officials o set duty_days=(
  select array_agg(distinct n order by n) from unnest(o.duty_days||array[day_number::smallint]) as n
 ),updated_by=actor.id
 where o.id=any(wanted) and not o.archived and not(day_number=any(o.duty_days));
 insert into vasra.duty_hours(weekday,opens,closes,updated_by)
 values(day_number,opening,closing,actor.id)
 on conflict(weekday) do update set opens=excluded.opens,closes=excluded.closes,
 updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into vasra.audit(actor_id,actor_name,action,entity,details)
 values(actor.id,actor.name,'duty_weekday_updated',day_number::text,
 jsonb_build_object('weekday',day_number,'start_time',opening,'end_time',closing,
 'previous_officer_ids',current_ids,'new_officer_ids',wanted));
 return jsonb_build_object('ok',true,'weekday',day_number);
end $$;
revoke all on function public.vasra_duty_management(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_duty_management(text,jsonb,text) to service_role;

-- Update today's office status using the official published hours.
create or replace function public.vasra_duty(action text,payload jsonb default '{}'::jsonb,session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date:=(clock_timestamp() at time zone 'Asia/Manila')::date;
 weekday integer:=extract(isodow from (clock_timestamp() at time zone 'Asia/Manila'));
 actor vasra.users; mode_value text; assigned_names text[]; has_schedule boolean;
 start_at time; stop_at time;
begin
 select h.opens,h.closes into start_at,stop_at from vasra.duty_hours h where h.weekday=weekday;
 start_at:=coalesce(start_at,'09:00'::time);stop_at:=coalesce(stop_at,'18:00'::time);
 if action='status' then
  select d.mode into mode_value from vasra.duty_overrides d where d.day=today;
  return jsonb_build_object('date',today,'mode',coalesce(mode_value,'auto'),
   'open_time',to_char(start_at,'HH24:MI'),'close_time',to_char(stop_at,'HH24:MI'));
 end if;
 if action<>'set' then return jsonb_build_object('error',404); end if;
 select u.* into actor from vasra.sessions s join vasra.users u on u.id=s.user_id
 where s.token=session_hash and s.expires>clock_timestamp() limit 1;
 if actor.id is null or actor.must_change or actor.role not in ('chairman','sk') then return jsonb_build_object('error',403); end if;
 if actor.role='sk' then
  select exists(select 1 from vasra.officials where published and not archived and cardinality(duty_days)>0) into has_schedule;
  if has_schedule then
   if not exists(select 1 from vasra.officials o where o.published and not o.archived
    and weekday=any(o.duty_days) and lower(trim(o.name))=lower(trim(actor.name)))
   then return jsonb_build_object('error',403,'reason','not_assigned_today'); end if;
  else
   assigned_names:=case weekday when 1 then array['gel bergonio']
    when 2 then array['ernest bragais','kristine de ocampo']
    when 3 then array['sherwin estanislao'] when 4 then array['rembert natividad']
    when 5 then array['arvin capiral'] when 6 then array['kath irag']
    when 7 then array['roland reyes'] end;
   if lower(trim(actor.name))<>all(assigned_names) then
    return jsonb_build_object('error',403,'reason','not_assigned_today'); end if;
  end if;
 end if;
 if payload->>'mode' not in ('closed','auto') then return jsonb_build_object('error',400); end if;
 insert into vasra.duty_overrides(day,mode,updated_by,updated_at)
 values(today,payload->>'mode',actor.id,clock_timestamp())
 on conflict(day) do update set mode=excluded.mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into vasra.audit(actor_id,actor_name,action,entity,details)
 values(actor.id,actor.name,'duty_status_changed',today::text,jsonb_build_object('mode',payload->>'mode'));
 return jsonb_build_object('date',today,'mode',payload->>'mode',
 'open_time',to_char(start_at,'HH24:MI'),'close_time',to_char(stop_at,'HH24:MI'));
end $$;
revoke all on function public.vasra_duty(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_duty(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;

  then return jsonb_build_object('error',400); end if;
  opening:=(payload->>'open_time')::time;
  closing:=(payload->>'close_time')::time;
  if opening>=closing then return jsonb_build_object('error',400); end if;
  insert into vasra.duty_hours(weekday,opens,closes,updated_by)
   values(day_number,opening,closing,actor.id)
   on conflict(weekday) do update set opens=excluded.opens,closes=excluded.closes,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
   values(actor.id,actor.name,'duty_hours_updated',day_number::text,
    jsonb_build_object('weekday',day_number,'open_time',opening,'close_time',closing));
  return jsonb_build_object('ok',true,'weekday',day_number);
 end if;
 if action<>'save_day' then return jsonb_build_object('error',404); end if;
 day_number:=(payload->>'weekday')::integer;
 if day_number not between 1 and 7
  or coalesce(payload->>'open_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or coalesce(payload->>'close_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or jsonb_typeof(payload->'official_ids') is distinct from 'array'
 then return jsonb_build_object('error',400); end if;
 opening:=(payload->>'open_time')::time;
 closing:=(payload->>'close_time')::time;
 if opening>=closing then return jsonb_build_object('error',400); end if;
 if jsonb_array_length(payload->'official_ids')>24 then return jsonb_build_object('error',400); end if;
 if exists(select 1 from jsonb_array_elements_text(payload->'official_ids') x
   where x.value !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
 then return jsonb_build_object('error',400); end if;
 select coalesce(array_agg(distinct x.value::uuid),'{}'::uuid[]) into wanted
 from jsonb_array_elements_text(payload->'official_ids') x;
 select count(*) into approved_count from vasra.officials o
 where o.id=any(wanted) and o.published and not o.archived;
 if approved_count<>cardinality(wanted) then return jsonb_build_object('error',400,'reason','officers_must_be_published'); end if;
 -- Only the selected day's membership is modified; other day assignments remain intact.
 select coalesce(array_agg(o.id),'{}'::uuid[]) into current_ids from vasra.officials o
 where day_number=any(o.duty_days) and not o.archived;
 update vasra.officials o set duty_days=array_remove(o.duty_days,day_number::smallint),updated_by=actor.id
 where day_number=any(o.duty_days) and not o.archived and not(o.id=any(wanted));
 update vasra.officials o set duty_days=(
  select array_agg(distinct n order by n) from unnest(o.duty_days||array[day_number::smallint]) as n
 ),updated_by=actor.id
 where o.id=any(wanted) and not o.archived and not(day_number=any(o.duty_days));
 insert into vasra.duty_hours(weekday,opens,closes,updated_by)
 values(day_number,opening,closing,actor.id)
 on conflict(weekday) do update set opens=excluded.opens,closes=excluded.closes,
 updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into vasra.audit(actor_id,actor_name,action,entity,details)
 values(actor.id,actor.name,'duty_weekday_updated',day_number::text,
 jsonb_build_object('weekday',day_number,'start_time',opening,'end_time',closing,
 'previous_officer_ids',current_ids,'new_officer_ids',wanted));
 return jsonb_build_object('ok',true,'weekday',day_number);
end $$;
revoke all on function public.vasra_duty_management(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_duty_management(text,jsonb,text) to service_role;

-- Update today's office status using the official published hours.
create or replace function public.vasra_duty(action text,payload jsonb default '{}'::jsonb,session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date:=(clock_timestamp() at time zone 'Asia/Manila')::date;
 weekday integer:=extract(isodow from (clock_timestamp() at time zone 'Asia/Manila'));
 actor vasra.users; mode_value text; assigned_names text[]; has_schedule boolean;
 start_at time; stop_at time;
begin
 select h.opens,h.closes into start_at,stop_at from vasra.duty_hours h where h.weekday=weekday;
 start_at:=coalesce(start_at,'09:00'::time);stop_at:=coalesce(stop_at,'18:00'::time);
 if action='status' then
  select d.mode into mode_value from vasra.duty_overrides d where d.day=today;
  return jsonb_build_object('date',today,'mode',coalesce(mode_value,'auto'),
   'open_time',to_char(start_at,'HH24:MI'),'close_time',to_char(stop_at,'HH24:MI'));
 end if;
 if action<>'set' then return jsonb_build_object('error',404); end if;
 select u.* into actor from vasra.sessions s join vasra.users u on u.id=s.user_id
 where s.token=session_hash and s.expires>clock_timestamp() limit 1;
 if actor.id is null or actor.must_change or actor.role not in ('chairman','sk') then return jsonb_build_object('error',403); end if;
 if actor.role='sk' then
  select exists(select 1 from vasra.officials where published and not archived and cardinality(duty_days)>0) into has_schedule;
  if has_schedule then
   if not exists(select 1 from vasra.officials o where o.published and not o.archived
    and weekday=any(o.duty_days) and lower(trim(o.name))=lower(trim(actor.name)))
   then return jsonb_build_object('error',403,'reason','not_assigned_today'); end if;
  else
   assigned_names:=case weekday when 1 then array['gel bergonio']
    when 2 then array['ernest bragais','kristine de ocampo']
    when 3 then array['sherwin estanislao'] when 4 then array['rembert natividad']
    when 5 then array['arvin capiral'] when 6 then array['kath irag']
    when 7 then array['roland reyes'] end;
   if lower(trim(actor.name))<>all(assigned_names) then
    return jsonb_build_object('error',403,'reason','not_assigned_today'); end if;
  end if;
 end if;
 if payload->>'mode' not in ('closed','auto') then return jsonb_build_object('error',400); end if;
 insert into vasra.duty_overrides(day,mode,updated_by,updated_at)
 values(today,payload->>'mode',actor.id,clock_timestamp())
 on conflict(day) do update set mode=excluded.mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into vasra.audit(actor_id,actor_name,action,entity,details)
 values(actor.id,actor.name,'duty_status_changed',today::text,jsonb_build_object('mode',payload->>'mode'));
 return jsonb_build_object('date',today,'mode',payload->>'mode',
 'open_time',to_char(start_at,'HH24:MI'),'close_time',to_char(stop_at,'HH24:MI'));
end $$;
revoke all on function public.vasra_duty(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_duty(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
