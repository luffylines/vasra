BEGIN;
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
  IF action='verify' THEN
    selected_ids:=payload->'image_ids';
    IF jsonb_typeof(selected_ids) IS DISTINCT FROM 'array' THEN
      RETURN jsonb_build_object('error',400);
    END IF;
    requested_count:=jsonb_array_length(selected_ids);
    IF requested_count>8 OR (SELECT count(DISTINCT x.id) FROM jsonb_array_elements_text(selected_ids) x(id))<>requested_count THEN
      RETURN jsonb_build_object('error',400);
    END IF;
    pid:=nullif(payload->>'project_id','')::uuid;
    IF pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vasra.projects WHERE id=pid) THEN
      RETURN jsonb_build_object('error',404);
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(selected_ids) x(id)
      LEFT JOIN vasra.images i ON i.id=x.id::uuid AND i.ready=true
      WHERE i.id IS NULL OR
        (i.owner<>actor.id AND
         NOT EXISTS(SELECT 1 FROM vasra.project_gallery pg WHERE pg.project_id=pid AND pg.image_id=i.id) AND
         NOT EXISTS(SELECT 1 FROM vasra.projects p WHERE p.id=pid AND p.image_id=i.id))
    ) THEN RETURN jsonb_build_object('error',400,'reason','unavailable_image'); END IF;
    RETURN jsonb_build_object('ok',true);
  END IF;
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

NOTIFY pgrst,'reload schema';
COMMIT;