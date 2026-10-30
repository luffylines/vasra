-- SK VASRA: multiple weekday duty assignments per officer without modifying existing entries.
begin;
alter table vasra.officials drop constraint if exists vasra_officials_duty_days_check;
alter table vasra.officials add constraint vasra_officials_duty_days_check check
(duty_days <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(duty_days)<=7) not valid;
CREATE OR REPLACE FUNCTION public.vasra_officer_profile(action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  assigned_days:=coalesce(old_profile.duty_days,'{}'::smallint[]);
  -- Monday-Saturday assignments allow two officials; Sunday is separate.
  if payload ? 'duty_weekdays' then
   if jsonb_typeof(payload->'duty_weekdays') is distinct from 'array'
      or jsonb_array_length(payload->'duty_weekdays')>6
      or exists(select 1 from jsonb_array_elements(payload->'duty_weekdays') e
        where jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[1-6]$')
   then return jsonb_build_object('error',400,'reason','invalid_weekday_list'); end if;
   if (select count(*) from jsonb_array_elements(payload->'duty_weekdays'))
     <> (select count(distinct e.value) from jsonb_array_elements(payload->'duty_weekdays') e)
   then return jsonb_build_object('error',400,'reason','duplicate_weekday'); end if;
   select coalesce(array_agg(w.day order by w.day),'{}'::smallint[]) into assigned_days
   from (select distinct (e.value #>> '{}')::smallint as day
     from jsonb_array_elements(payload->'duty_weekdays') e) w;
   if 7::smallint=any(old_profile.duty_days)
   then assigned_days:=array_append(assigned_days,7::smallint); end if;
   perform pg_advisory_xact_lock(20261030,1);
   if exists(select 1 from generate_series(1,6) d
       where d::smallint=any(assigned_days)
         and (select count(*) from vasra.officials o
              where o.id<>item and o.published and not o.archived
                and d::smallint=any(o.duty_days))>=2)
   then return jsonb_build_object('error',409,'reason','two_officers_maximum'); end if;
  elsif payload ? 'duty_day' then
   if payload->>'duty_day' is null then
    assigned_days:=case when 7::smallint=any(assigned_days) then array[7::smallint] else '{}'::smallint[] end;
   elsif payload->>'duty_day' ~ '^[1-6]$' then
    assigned_days:=array[(payload->>'duty_day')::smallint];
    if 7::smallint=any(old_profile.duty_days) then assigned_days:=array_append(assigned_days,7::smallint); end if;
    perform pg_advisory_xact_lock(20261030,1);
    if (select count(*) from vasra.officials o
        where o.id<>item and o.published and not o.archived
          and (payload->>'duty_day')::smallint=any(o.duty_days)) >= 2
      then return jsonb_build_object('error',409,'reason','two_officers_maximum'); end if;
   else return jsonb_build_object('error',400,'reason','choose_monday_to_saturday'); end if;
  end if;
  if payload ? 'duty_sunday' then
   if jsonb_typeof(payload->'duty_sunday')<>'boolean' then return jsonb_build_object('error',400); end if;
   assigned_days:=array_remove(assigned_days,7::smallint);
   if (payload->>'duty_sunday')::boolean then assigned_days:=array_append(assigned_days,7::smallint); end if;
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
end $function$
;
revoke all on function public.vasra_officer_profile(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_officer_profile(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;