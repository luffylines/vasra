-- Exactly three editable SK VASRA homepage services. Chairman-controlled.
-- Public view returns presentation data only, never storage paths or account information.
begin;
create table if not exists vasra.current_service_projects(
 slug text primary key check(slug in ('printing','computer','retabox')),
 title text not null check(length(title) between 4 and 150),
 summary text not null check(length(btrim(summary)) between 20 and 1800),
 image_path text,
 image_mime text check(image_mime in ('image/jpeg','image/png','image/webp')),
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references vasra.users(id),
 constraint current_service_image_pair check((image_path is null)=(image_mime is null))
);
alter table vasra.current_service_projects enable row level security;
revoke all on vasra.current_service_projects from public,anon,authenticated;
grant select,insert,update on vasra.current_service_projects to service_role;

insert into vasra.current_service_projects(slug,title,summary) values
 ('printing','FREE PRINTING AND PHOTOCOPYING SERVICES',
  'Libreng printing at photocopying para sa mga kwalipikadong kabataang Vasra. Mag-login sa iyong verified KK account para pumili ng paper size, black-and-white o colored, bilang ng pahina at copies bago mag-request.'),
 ('computer','VASRA MIND HUB · FREE COMPUTER USE',
  'Gamitin ang VASRA Mind Hub para sa mga gawain sa paaralan, research at digital activities. Mag-login sa iyong verified KK account para mag-request ng computer use at piliin ang bilang ng oras.'),
 ('retabox','RETABOX · DONATION BOX',
  'Makibahagi sa RetaBox donation program ng SK Vasra. Mag-login sa iyong verified KK account upang mag-submit ng RetaBox request at ilagay ang timbang o grams ng iyong dadalhing donasyon.')
on conflict(slug) do nothing;

create or replace function public.vasra_current_service_project(
 action text, payload jsonb default '{}'::jsonb, session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $current_service$
declare
 actor vasra.users;
 service_key text:=coalesce(payload->>'slug','');
 new_summary text;
 new_path text;
 new_mime text;
 current_row vasra.current_service_projects;
begin
 if action='public' then
  return jsonb_build_object('projects',coalesce((
   select jsonb_agg(jsonb_build_object(
    'slug',p.slug,'title',p.title,'summary',p.summary,
    'has_image',p.image_path is not null,'updated_at',p.updated_at)
    order by case p.slug when 'printing' then 1 when 'computer' then 2 else 3 end)
   from vasra.current_service_projects p),'[]'::jsonb));
 end if;
 if action='image' then
  return coalesce((select jsonb_build_object('path',p.image_path,'mime',p.image_mime)
   from vasra.current_service_projects p where p.slug=service_key and p.image_path is not null),
   jsonb_build_object('error',404));
 end if;
 select u.* into actor from vasra.users u join vasra.sessions s on s.user_id=u.id
 where s.token=session_hash and s.expires>clock_timestamp()
 and u.role='chairman' and u.disabled_at is null and not u.must_change limit 1;
 if actor.id is null then return jsonb_build_object('error',403); end if;
 if action='manage' then
  return jsonb_build_object('projects',coalesce((
   select jsonb_agg(jsonb_build_object(
    'slug',p.slug,'title',p.title,'summary',p.summary,
    'has_image',p.image_path is not null,'updated_at',p.updated_at)
    order by case p.slug when 'printing' then 1 when 'computer' then 2 else 3 end)
   from vasra.current_service_projects p),'[]'::jsonb));
 end if;
 if service_key not in ('printing','computer','retabox') then
  return jsonb_build_object('error',400);
 end if;
 select * into current_row from vasra.current_service_projects where slug=service_key for update;
 if not found then return jsonb_build_object('error',404); end if;
 if action='save' then
  new_summary:=btrim(coalesce(payload->>'summary',''));
  if length(new_summary) not between 20 and 1800 or new_summary ~ '[<>[:cntrl:]]'
   then return jsonb_build_object('error',400,'reason','invalid_summary'); end if;
  update vasra.current_service_projects set summary=new_summary,
   updated_at=clock_timestamp(),updated_by=actor.id where slug=service_key;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
   values(actor.id,actor.name,'current_service_summary_updated',service_key,
    jsonb_build_object('service',service_key));
  return jsonb_build_object('ok',true);
 end if;
 if action='photo' then
  new_path:=coalesce(payload->>'path','');
  new_mime:=coalesce(payload->>'mime','');
  if new_path !~ ('^current-projects/'||service_key||'/[0-9a-f-]{36}[.](jpg|png|webp)$')
   or new_mime not in ('image/jpeg','image/png','image/webp')
   or (right(new_path,4)='.jpg' and new_mime<>'image/jpeg')
   or (right(new_path,4)='.png' and new_mime<>'image/png')
   or (right(new_path,5)='.webp' and new_mime<>'image/webp')
   then return jsonb_build_object('error',400,'reason','invalid_image'); end if;
  update vasra.current_service_projects
   set image_path=new_path,image_mime=new_mime,
    updated_at=clock_timestamp(),updated_by=actor.id where slug=service_key;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
   values(actor.id,actor.name,'current_service_photo_updated',service_key,
     jsonb_build_object('service',service_key));
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error',404);
end $current_service$;
revoke all on function public.vasra_current_service_project(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_current_service_project(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;