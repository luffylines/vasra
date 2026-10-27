-- Follow-up only. Preserve attendance, points, QR rules, and existing rosters.
-- Completed Event Exports now orders by the latest actual verified attendance.
-- Review before applying to Supabase; no production migration from this commit.
CREATE OR REPLACE FUNCTION public.vasra_kk_event_attendance(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 officer vasra.users;
 member vasra.kk_members;
 selected_event vasra.projects;
 att vasra.kk_project_attendance;
 project_ref uuid;
 normalized_kk_id text;
 record_member_id uuid;
 recorded_at timestamptz;
BEGIN
 SELECT u.* INTO officer
 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
 AND u.role IN ('sk','chairman') AND u.disabled_at IS NULL AND NOT u.must_change
 LIMIT 1;
 IF action='history' THEN
  SELECT m.* INTO member
  FROM vasra.kk_sessions s JOIN vasra.kk_members m ON m.id=s.member_id
  JOIN vasra.kk_profiles p ON p.member_id=m.id
  WHERE s.token_hash=session_hash AND s.expires>clock_timestamp() AND p.status='verified'
  LIMIT 1;
  IF member.id IS NULL THEN RETURN jsonb_build_object('error',401); END IF;
  RETURN jsonb_build_object('history',coalesce((
    SELECT jsonb_agg(jsonb_build_object('project_id',a.project_id,'title',p.title,
      'points',a.points,'checked_in_at',a.confirmed_at,'date', (a.confirmed_at at time zone 'Asia/Manila')::date)
      ORDER BY a.confirmed_at DESC)
    FROM vasra.kk_project_attendance a JOIN vasra.projects p ON p.id=a.project_id
    WHERE a.member_id=member.id
  ),'[]'::jsonb));
 END IF;
 IF officer.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF action='events' THEN
  RETURN jsonb_build_object('officer',jsonb_build_object('name',officer.name),
   'active_events',coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'status',p.status,
      'attendees',(SELECT count(*) FROM vasra.kk_project_attendance a WHERE a.project_id=p.id))
      ORDER BY p.created DESC)
    FROM vasra.projects p WHERE p.published=true
     AND (p.publish_at IS NULL OR p.publish_at<=clock_timestamp()) AND p.status='Isinasagawa'
   ),'[]'::jsonb),
   'finished_events',coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',ev.id,'title',ev.title,'status',ev.status,
      'created_at',ev.created,'attendees',ev.attendees,'last_checkin_at',ev.last_checkin_at)
      ORDER BY ev.last_checkin_at DESC, ev.created DESC,ev.id)
    FROM (
     SELECT p.id,p.title,p.status,p.created,
      (SELECT count(*) FROM vasra.kk_project_attendance a WHERE a.project_id=p.id) AS attendees,
      (SELECT max(a.confirmed_at) FROM vasra.kk_project_attendance a WHERE a.project_id=p.id) AS last_checkin_at
     FROM vasra.projects p
     WHERE p.published=true AND p.status='Natapos'
       AND EXISTS(SELECT 1 FROM vasra.kk_project_attendance a WHERE a.project_id=p.id)
    ) ev
   ),'[]'::jsonb));
 END IF;
 IF coalesce(payload->>'project_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN jsonb_build_object('error',400); END IF;
 project_ref=(payload->>'project_id')::uuid;
 IF action='roster' THEN
  SELECT * INTO selected_event FROM vasra.projects p WHERE p.id=project_ref
   AND p.published=true AND p.status IN ('Isinasagawa','Natapos');
  IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
  RETURN jsonb_build_object('event',jsonb_build_object('id',selected_event.id,
   'title',selected_event.title,'status',selected_event.status),
   'participants',coalesce((
    SELECT jsonb_agg(jsonb_build_object('kk_id',pr.kk_id,
      'name',concat_ws(' ',m.first_name,nullif(m.middle_name,''),m.last_name),
      'points',a.points,'checked_in_at',a.confirmed_at,'officer',u.name)
      ORDER BY a.confirmed_at ASC)
    FROM vasra.kk_project_attendance a JOIN vasra.kk_members m ON m.id=a.member_id
    JOIN vasra.kk_profiles pr ON pr.member_id=m.id
    LEFT JOIN vasra.users u ON u.id=a.officer_id
    WHERE a.project_id=project_ref
  ),'[]'::jsonb));
 END IF;
 IF action='checkin' THEN
  -- Lock the selected event so a completed event cannot receive new check-ins.
  SELECT * INTO selected_event FROM vasra.projects p WHERE p.id=project_ref FOR UPDATE;
  IF NOT FOUND OR selected_event.published IS DISTINCT FROM true
   OR selected_event.status<>'Isinasagawa'
   OR (selected_event.publish_at IS NOT NULL AND selected_event.publish_at>clock_timestamp())
  THEN RETURN jsonb_build_object('error',409,'reason','event_not_in_progress'); END IF;
  normalized_kk_id=upper(btrim(coalesce(payload->>'kk_id','')));
  IF normalized_kk_id !~ '^VASRA-KK-[0-9]{1,10}$'
  THEN RETURN jsonb_build_object('error',400,'reason','invalid_kk_id'); END IF;
  SELECT m.* INTO member FROM vasra.kk_profiles pr
    JOIN vasra.kk_members m ON m.id=pr.member_id
    WHERE pr.kk_id=normalized_kk_id AND pr.status='verified'
    FOR UPDATE OF m;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',404,'reason','member_not_verified'); END IF;
  -- Insert attendance and exactly +10 ledger points in one atomic transaction.
  INSERT INTO vasra.kk_project_attendance(project_id,member_id,points,officer_id,confirmed_at)
    VALUES(project_ref,member.id,10,officer.id,clock_timestamp())
    ON CONFLICT(project_id,member_id) DO NOTHING
    RETURNING confirmed_at INTO recorded_at;
  IF recorded_at IS NULL THEN RETURN jsonb_build_object('error',409,'reason','already_checked_in'); END IF;
  INSERT INTO vasra.kk_points(member_id,delta,reason,staff_id)
    VALUES(member.id,10,'Event attendance: '||left(selected_event.title,120),officer.id);
  INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
    VALUES(officer.id,officer.name,'kk_event_attendance',member.id::text,
      jsonb_build_object('project_id',project_ref,'kk_id',normalized_kk_id,
       'points',10,'checked_in_at',recorded_at));
  RETURN jsonb_build_object('ok',true,'kk_id',normalized_kk_id,
    'name',concat_ws(' ',member.first_name,nullif(member.middle_name,''),member.last_name),
    'title',selected_event.title,'checked_in_at',recorded_at,'points',10,'officer',officer.name);
 END IF;
 RETURN jsonb_build_object('error',404);
END $fn$;
