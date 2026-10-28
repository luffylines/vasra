-- Targeted progress updates for staff, with optimistic locking and immutable audit.
BEGIN;
CREATE OR REPLACE FUNCTION public.vasra_project_progress(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 actor vasra.users;
 old_row vasra.projects;
 saved vasra.projects;
 next_progress integer;
 next_status text;
BEGIN
 IF action <> 'update' THEN RETURN jsonb_build_object('error',404); END IF;
 SELECT u.* INTO actor FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
   AND u.role IN ('chairman','sk') AND NOT u.must_change
 LIMIT 1;
 IF actor.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF payload->>'id' IS NULL OR payload->>'progress' IS NULL OR payload->>'version' IS NULL
    OR (payload->>'progress') !~ '^(0|[1-9][0-9]?|100)$'
    OR (payload->>'version') !~ '^[1-9][0-9]*$' THEN
   RETURN jsonb_build_object('error',400);
 END IF;
 next_progress:=(payload->>'progress')::integer;
 SELECT * INTO old_row FROM vasra.projects WHERE id=(payload->>'id')::uuid FOR UPDATE;
 IF old_row.id IS NULL THEN RETURN jsonb_build_object('error',404); END IF;
 IF old_row.version<>(payload->>'version')::integer THEN
   RETURN jsonb_build_object('error',409,'reason','stale_version');
 END IF;
 next_status:=CASE WHEN next_progress=0 THEN 'Pinaplano'
                   WHEN next_progress=100 THEN 'Natapos'
                   ELSE 'Isinasagawa' END;
 IF old_row.progress=next_progress AND old_row.status=next_status THEN
   RETURN jsonb_build_object('ok',true,'project',to_jsonb(old_row),'unchanged',true);
 END IF;
 UPDATE vasra.projects SET progress=next_progress,status=next_status,
   updated_by=actor.id,updated=clock_timestamp(),version=version+1
 WHERE id=old_row.id RETURNING * INTO saved;
 INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
 VALUES(actor.id,actor.name,'project_progress_updated',saved.id::text,
  jsonb_build_object('title',saved.title,'before_progress',old_row.progress,
  'after_progress',saved.progress,'before_status',old_row.status,'after_status',saved.status));
 RETURN jsonb_build_object('ok',true,'project',to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.vasra_project_progress(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_project_progress(text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;