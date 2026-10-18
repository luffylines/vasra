-- Proposed SK roster turnover: per-officer photo and current weekly duty assignments.
-- STAGED ONLY. Requires Chairman approval and explicit database migration before production.
begin;
alter table vasra.officials add column if not exists photo_id uuid references vasra.images(id);
alter table vasra.officials add column if not exists duty_days smallint[] not null default '{}'::smallint[];
alter table vasra.officials add column if not exists duty_photo_id uuid references vasra.images(id);
alter table vasra.officials drop constraint if exists vasra_officials_duty_days_check;
alter table vasra.officials add constraint vasra_officials_duty_days_check check(
 duty_days <@ array[1,2,3,4,5,6,7]::smallint[] and
 cardinality(duty_days)<=1
);
-- This server-only RPC never exposes private images or account credentials.
create or replace function public.vasra_officer_profile(action text,payload jsonb default '{}'::jsonb,session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor vasra.users; old_profile vasra.officials; requested_photo uuid; assigned_days smallint[]; item uuid;
begin
 if action='public' then
  return jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object(
   'id',o.id,'name',o.name,'position',o.position,'photo_id',o.photo_id,'duty_photo_id',o.duty_photo_id,'duty_days',o.duty_days)
   order by o.display_order,o.name) from vasra.officials o
   where o.published and not o.archived),'[]'::jsonb),
   'managed',(select exists(select 1 from vasra.officials where published and not archived
    and cardinality(duty_days)>0)));
 end if;
 if action='photo' then
  item:=(payload->>'id')::uuid;
  return coalesce((select jsonb_build_object('storage_path',i.storage_path,'mime',i.mime)
   from vasra.images i join vasra.officials o on (o.photo_id=i.id or o.duty_photo_id=i.id)
   where i.id=item and i.ready and o.published and not o.archived limit 1),
   jsonb_build_object('error',404));
 end if;
 select u.* into actor from vasra.users u join vasra.sessions s on u.id=s.user_id
 where s.token=session_hash and s.expires>clock_timestamp() and not u.must_change limit 1;
 if actor.id is null or actor.role<>'chairman' then return jsonb_build_object('error',403); end if;
 if action='photo_manage' then
  item:=(payload->>'id')::uuid;
  return coalesce((select jsonb_build_object('storage_path',i.storage_path,'mime',i.mime)
   from vasra.images i where i.id=item and i.ready and
    (i.owner=actor.id or exists(select 1 from vasra.officials o where (o.photo_id=item or o.duty_photo_id=item) and not o.archived))),jsonb_build_object('error',404));
 end if;
 if action='manage' then
  return jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object(
  'id',o.id,'name',o.name,'position',o.position,'photo_id',o.photo_id,'duty_photo_id',o.duty_photo_id,'duty_days',o.duty_days,'published',o.published)
   order by o.display_order,o.name) from vasra.officials o where not o.archived),'[]'::jsonb));
 end if;
 if action='duty' then
  item:=(payload->>'id')::uuid;
  select * into old_profile from vasra.officials where id=item and published and not archived for update;
  if not found then return jsonb_build_object('error',404,'reason','publish_officer_first'); end if;
  assigned_days:=old_profile.duty_days;
  if payload ? 'duty_day' then
   if payload->>'duty_day' is null then assigned_days:='{}'::smallint[];
   elsif payload->>'duty_day' ~ '^[1-7]$' then assigned_days:=array[(payload->>'duty_day')::smallint];
   else return jsonb_build_object('error',400); end if;
  end if;
  requested_photo:=old_profile.duty_photo_id;
  if payload ? 'duty_photo_id' then
   requested_photo:=nullif(payload->>'duty_photo_id','')::uuid;
   if requested_photo is not null and not exists(
      select 1 from vasra.images i where i.id=requested_photo and i.ready
       and (i.owner=actor.id or i.id=old_profile.duty_photo_id)
   ) then return jsonb_build_object('error',400,'reason','duty_photo_unavailable'); end if;
  end if;
  update vasra.officials set duty_days=assigned_days,duty_photo_id=requested_photo,updated_by=actor.id where id=item;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
  values(actor.id,actor.name,'duty_officer_updated',item::text,jsonb_build_object(
   'previous_duty_days',old_profile.duty_days,'duty_days',assigned_days,
   'old_duty_photo_id',old_profile.duty_photo_id,'new_duty_photo_id',requested_photo));
  return jsonb_build_object('ok',true,'id',item,'duty_days',assigned_days,'duty_photo_id',requested_photo);
 end if;
 if action='update' then
  item:=(payload->>'id')::uuid;
  select * into old_profile from vasra.officials where id=item and not archived for update;
  if not found then return jsonb_build_object('error',404); end if;
  -- Organizational photo saves do not change duty assignment or duty portrait.
  assigned_days:=old_profile.duty_days;
  requested_photo:=nullif(payload->>'photo_id','')::uuid;
  if requested_photo is not null and not exists(
   select 1 from vasra.images i where i.id=requested_photo and i.ready
   and (i.owner=actor.id or i.id=old_profile.photo_id)
  ) then return jsonb_build_object('error',400,'reason','photo_unavailable'); end if;
  update vasra.officials set photo_id=requested_photo,updated_by=actor.id where id=item;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
  values(actor.id,actor.name,'official_profile_updated',item::text,jsonb_build_object(
   'previous_photo_id',old_profile.photo_id,'new_photo_id',requested_photo,
   'previous_duty_days',old_profile.duty_days,'new_duty_days',assigned_days));
  return jsonb_build_object('ok',true,'id',item,'photo_id',requested_photo,'duty_days',assigned_days);
 end if;
 return jsonb_build_object('error',404);
end $$;
revoke all on function public.vasra_officer_profile(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_officer_profile(text,jsonb,text) to service_role;

-- Same source of truth controls changing office status. The historical hardcoded
-- 2026 roster remains only until the Chairman publishes a managed duty schedule.
create or replace function public.vasra_duty(action text,payload jsonb default '{}'::jsonb,session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date:=(clock_timestamp() at time zone 'Asia/Manila')::date;
 weekday integer:=extract(isodow from (clock_timestamp() at time zone 'Asia/Manila'));
 actor vasra.users; mode_value text; assigned_names text[]; has_schedule boolean;
begin
 if action='status' then
  select d.mode into mode_value from vasra.duty_overrides d where d.day=today;
  return jsonb_build_object('date',today,'mode',coalesce(mode_value,'auto'));
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
 return jsonb_build_object('date',today,'mode',payload->>'mode');
end $$;
revoke all on function public.vasra_duty(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_duty(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
