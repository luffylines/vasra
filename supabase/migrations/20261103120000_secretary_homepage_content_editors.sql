-- Allow the SK Secretary to manage Current Project and Hero Backgrounds alongside the Chairperson.
-- No data backfill, new tables, RLS policy changes, or unrelated staff privileges.
-- Apply only after 20261029224500_current_project_multiline_summary.sql and
-- 20261102211500_chairman_site_hero_backgrounds.sql.
-- The auth checks also exist in lib/handler.cjs. Both layers must authorize.
BEGIN;

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
 and (u.role='chairman' or (u.role='sk' and u.position='secretary'))
 and u.disabled_at is null and not u.must_change limit 1;
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
  if length(new_summary) not between 20 and 12000
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

CREATE OR REPLACE FUNCTION public.vasra_site_hero_media(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $hero$
DECLARE
 actor vasra.users;
 selected_key text:=coalesce(payload->>'key','');
 incoming_path text:=coalesce(payload->>'path','');
 incoming_mime text:=coalesce(payload->>'mime','');
 stamp timestamptz;
BEGIN
 IF action='public' THEN
  RETURN jsonb_build_object('items',coalesce((
   SELECT jsonb_agg(jsonb_build_object('key',h.hero_key,
    'has_image',h.image_path IS NOT NULL,'updated_at',h.updated_at)
    ORDER BY CASE h.hero_key WHEN 'home' THEN 1 WHEN 'projects' THEN 2
     WHEN 'duty' THEN 3 WHEN 'transparency' THEN 4 ELSE 5 END)
   FROM vasra.site_hero_media h),'[]'::jsonb));
 END IF;
 IF action='image' THEN
  RETURN coalesce((SELECT jsonb_build_object('path',h.image_path,'mime',h.image_mime)
    FROM vasra.site_hero_media h WHERE h.hero_key=selected_key AND h.image_path IS NOT NULL),
    jsonb_build_object('error',404));
 END IF;
 SELECT u.* INTO actor
 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
 AND (u.role='chairman' OR (u.role='sk' AND u.position='secretary'))
 AND u.disabled_at IS NULL AND NOT u.must_change
 LIMIT 1;
 IF actor.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF action='manage' THEN
  RETURN jsonb_build_object('items',coalesce((
   SELECT jsonb_agg(jsonb_build_object('key',h.hero_key,
    'has_image',h.image_path IS NOT NULL,'updated_at',h.updated_at)
    ORDER BY CASE h.hero_key WHEN 'home' THEN 1 WHEN 'projects' THEN 2
     WHEN 'duty' THEN 3 WHEN 'transparency' THEN 4 ELSE 5 END)
   FROM vasra.site_hero_media h),'[]'::jsonb));
 END IF;
 IF selected_key NOT IN ('home','projects','duty','transparency','contacts')
 THEN RETURN jsonb_build_object('error',400,'reason','invalid_key'); END IF;
 IF action='save' THEN
  IF incoming_path !~ ('^hero-backgrounds/'||selected_key||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
    OR incoming_mime NOT IN ('image/jpeg','image/png','image/webp')
    OR (right(incoming_path,4)='.jpg' AND incoming_mime<>'image/jpeg')
    OR (right(incoming_path,4)='.png' AND incoming_mime<>'image/png')
    OR (right(incoming_path,5)='.webp' AND incoming_mime<>'image/webp')
  THEN RETURN jsonb_build_object('error',400,'reason','invalid_image'); END IF;
  UPDATE vasra.site_hero_media SET image_path=incoming_path,image_mime=incoming_mime,
    updated_at=clock_timestamp(),updated_by=actor.id
    WHERE hero_key=selected_key RETURNING updated_at INTO stamp;
  INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
   VALUES(actor.id,actor.name,'site_hero_background_updated',selected_key,
    jsonb_build_object('key',selected_key));
  RETURN jsonb_build_object('ok',true,'updated_at',stamp);
 END IF;
 IF action='reset' THEN
  UPDATE vasra.site_hero_media SET image_path=NULL,image_mime=NULL,
   updated_at=clock_timestamp(),updated_by=actor.id
   WHERE hero_key=selected_key RETURNING updated_at INTO stamp;
  INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
   VALUES(actor.id,actor.name,'site_hero_background_reset',selected_key,
    jsonb_build_object('key',selected_key));
  RETURN jsonb_build_object('ok',true,'updated_at',stamp);
 END IF;
 RETURN jsonb_build_object('error',404);
END $hero$;

-- Retain service-role-only RPC access; anon/authenticated browsers cannot invoke directly.
REVOKE ALL ON FUNCTION public.vasra_current_service_project(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_current_service_project(text,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.vasra_site_hero_media(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_site_hero_media(text,jsonb,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
