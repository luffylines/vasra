-- Private multi-photo project gallery (up to 8). Cover remains projects.image_id.
BEGIN;
CREATE TABLE IF NOT EXISTS vasra.project_gallery (
  project_id uuid NOT NULL REFERENCES vasra.projects(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES vasra.images(id),
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 7),
  PRIMARY KEY(project_id,position),
  UNIQUE(project_id,image_id)
);
CREATE INDEX IF NOT EXISTS project_gallery_image_idx ON vasra.project_gallery(image_id);
ALTER TABLE vasra.project_gallery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vasra.project_gallery FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON vasra.project_gallery TO service_role;

CREATE OR REPLACE FUNCTION public.vasra_gallery(action text,payload jsonb DEFAULT '{}'::jsonb,session_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  actor vasra.users;
  pid uuid;
  selected_ids jsonb;
  existing_cover uuid;
  result jsonb;
  requested_count integer;
BEGIN
  IF action='public' THEN
    SELECT coalesce(jsonb_object_agg(g.project_id::text,g.ids),'{}'::jsonb) INTO result
    FROM (
      SELECT pg.project_id,jsonb_agg(pg.image_id ORDER BY pg.position) ids
      FROM vasra.project_gallery pg JOIN vasra.projects p ON p.id=pg.project_id AND p.published=true
      GROUP BY pg.project_id
    ) g;
    RETURN result;
  END IF;
  SELECT u.* INTO actor FROM vasra.users u JOIN vasra.sessions s ON s.user_id=u.id
  WHERE s.token=session_hash AND s.expires>clock_timestamp()
    AND u.role IN ('sk','chairman') AND NOT u.must_change
  LIMIT 1;
  IF action='image' THEN
    SELECT to_jsonb(i)-'chunks'-'upload_session' INTO result
    FROM vasra.project_gallery g
    JOIN vasra.projects p ON p.id=g.project_id
    JOIN vasra.images i ON i.id=g.image_id AND i.ready=true
    WHERE i.id=(payload->>'id')::uuid
      AND (p.published OR actor.id IS NOT NULL)
    LIMIT 1;
    RETURN coalesce(result,'null'::jsonb);
  END IF;
  IF actor.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
  IF action='manage' THEN
    SELECT coalesce(jsonb_object_agg(g.project_id::text,g.ids),'{}'::jsonb) INTO result
    FROM (
      SELECT pg.project_id,jsonb_agg(pg.image_id ORDER BY pg.position) ids
      FROM vasra.project_gallery pg GROUP BY pg.project_id
    ) g;
    RETURN result;
  END IF;
  IF action<>'set' THEN RETURN jsonb_build_object('error',404); END IF;
  pid:=(payload->>'project_id')::uuid;
  selected_ids:=payload->'image_ids';
  IF jsonb_typeof(selected_ids) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('error',400);
  END IF;
  requested_count:=jsonb_array_length(selected_ids);
  IF requested_count>8 THEN RETURN jsonb_build_object('error',400); END IF;
  SELECT p.image_id INTO existing_cover FROM vasra.projects p WHERE p.id=pid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
  IF (requested_count=0 AND existing_cover IS NOT NULL) OR
     (requested_count>0 AND existing_cover IS DISTINCT FROM (selected_ids->>0)::uuid) THEN
    RETURN jsonb_build_object('error',409,'reason','cover_mismatch');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(selected_ids) x(id)
    LEFT JOIN vasra.images i ON i.id=x.id::uuid AND i.ready=true
    WHERE i.id IS NULL OR
      (i.owner<>actor.id
        AND NOT EXISTS (
          SELECT 1 FROM vasra.project_gallery pg
          WHERE pg.project_id=pid AND pg.image_id=i.id
        ) AND i.id IS DISTINCT FROM existing_cover)
  ) THEN RETURN jsonb_build_object('error',400,'reason','unavailable_image'); END IF;
  IF (SELECT count(DISTINCT x.id) FROM jsonb_array_elements_text(selected_ids) x(id))<>requested_count
  THEN RETURN jsonb_build_object('error',400,'reason','duplicate_image'); END IF;
  DELETE FROM vasra.project_gallery WHERE project_id=pid;
  INSERT INTO vasra.project_gallery(project_id,image_id,position)
  SELECT pid,x.id::uuid,(x.ordinality-1)::smallint
  FROM jsonb_array_elements_text(selected_ids) WITH ORDINALITY x(id,ordinality);
  INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
    VALUES(actor.id,actor.name,'project_gallery_updated',pid::text,jsonb_build_object('image_count',requested_count));
  RETURN jsonb_build_object('ok',true,'image_ids',selected_ids);
END $$;
REVOKE ALL ON FUNCTION public.vasra_gallery(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_gallery(text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;