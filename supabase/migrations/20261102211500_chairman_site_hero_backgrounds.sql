-- Chairman-managed public hero backgrounds; private image storage via existing
-- vasra-project-images bucket. Deploy this migration before enabling the UI.
BEGIN;
CREATE TABLE IF NOT EXISTS vasra.site_hero_media(
 hero_key text PRIMARY KEY CHECK (hero_key IN ('home','projects','duty','transparency','contacts')),
 image_path text,
 image_mime text CHECK (image_mime IN ('image/jpeg','image/png','image/webp')),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by uuid REFERENCES vasra.users(id),
 CONSTRAINT hero_media_image_pair CHECK ((image_path IS NULL)=(image_mime IS NULL))
);
ALTER TABLE vasra.site_hero_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vasra.site_hero_media FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON vasra.site_hero_media TO service_role;
INSERT INTO vasra.site_hero_media(hero_key) VALUES
 ('home'),('projects'),('duty'),('transparency'),('contacts')
ON CONFLICT(hero_key) DO NOTHING;

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
 IF selected_key NOT IN ('home','projects','duty','transparency','contacts')
 THEN RETURN jsonb_build_object('error',400,'reason','invalid_key'); END IF;
 IF action='image' THEN
  RETURN coalesce((SELECT jsonb_build_object('path',h.image_path,'mime',h.image_mime)
    FROM vasra.site_hero_media h WHERE h.hero_key=selected_key AND h.image_path IS NOT NULL),
    jsonb_build_object('error',404));
 END IF;
 SELECT u.* INTO actor
 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
 AND u.role='chairman' AND u.disabled_at IS NULL AND NOT u.must_change
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
REVOKE ALL ON FUNCTION public.vasra_site_hero_media(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_site_hero_media(text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
