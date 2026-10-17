-- Allow authorized SK officers and the SK Chairman to delete projects.
-- This changes only project deletion privileges; it does not open user,
-- official-directory, or financial management to SK officers.
-- Financial reports, optimistic project version checks, and audit history
-- remain protected exactly as before.
BEGIN;
CREATE OR REPLACE FUNCTION public.vasra_project_delete(
  action text,payload jsonb DEFAULT '{}'::jsonb,session_hash text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 actor vasra.users;
 project_row vasra.projects;
 report_count integer;
 gallery_count integer;
BEGIN
 IF action<>'delete' THEN RETURN jsonb_build_object('error',404); END IF;
 SELECT u.* INTO actor
 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
   AND u.role IN ('sk','chairman') AND NOT u.must_change LIMIT 1;
 IF actor.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF payload->>'id' IS NULL OR payload->>'version' IS NULL THEN
   RETURN jsonb_build_object('error',400);
 END IF;
 SELECT * INTO project_row FROM vasra.projects
 WHERE id=(payload->>'id')::uuid FOR UPDATE;
 IF project_row.id IS NULL THEN RETURN jsonb_build_object('error',404); END IF;
 IF project_row.version<>(payload->>'version')::integer THEN
   RETURN jsonb_build_object('error',409,'reason','changed');
 END IF;
 SELECT count(*) INTO report_count FROM vasra.monthly_updates
 WHERE project_id=project_row.id;
 IF report_count>0 THEN
   RETURN jsonb_build_object('error',409,'reason','monthly_reports','reports',report_count);
 END IF;
 SELECT count(*) INTO gallery_count FROM vasra.project_gallery
 WHERE project_id=project_row.id;
 INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
 VALUES(actor.id,actor.name,'project_deleted',project_row.id::text,
   jsonb_build_object('title',project_row.title,'published',project_row.published,
   'status',project_row.status,'gallery_count',gallery_count));
 DELETE FROM vasra.projects WHERE id=project_row.id;
 RETURN jsonb_build_object('ok',true,'id',project_row.id);
END $$;
REVOKE ALL ON FUNCTION public.vasra_project_delete(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_project_delete(text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
