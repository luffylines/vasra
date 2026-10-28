-- Historical service archive: paginated, server-searched, PHT date filtered, staff-only.
-- Existing requests, statuses, and service completion audit are untouched.
CREATE OR REPLACE FUNCTION public.vasra_kk_service_archive(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $archive$
DECLARE
 is_staff boolean;
 page_limit integer;
 page_offset integer;
 match_text text;
 match_date text;
 total_rows bigint;
 result_rows jsonb;
BEGIN
 SELECT EXISTS (
  SELECT 1 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
  WHERE s.token=session_hash AND s.expires>clock_timestamp()
   AND u.role IN ('chairman','sk') AND u.disabled_at IS NULL AND NOT u.must_change
 ) INTO is_staff;
 IF NOT is_staff THEN RETURN jsonb_build_object('error',403); END IF;
 IF action <> 'list' THEN RETURN jsonb_build_object('error',404); END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('error',400); END IF;
 IF coalesce(payload->>'limit','100') !~ '^[0-9]{1,4}$'
  OR coalesce(payload->>'offset','0') !~ '^[0-9]{1,9}$'
  THEN RETURN jsonb_build_object('error',400); END IF;
 page_limit=LEAST(500,GREATEST(1,coalesce((payload->>'limit')::int,100)));
 page_offset=GREATEST(0,coalesce((payload->>'offset')::int,0));
 match_text=lower(btrim(coalesce(payload->>'search','')));
 match_date=btrim(coalesce(payload->>'date',''));
 IF length(match_text)>120 OR (match_date<>'' AND match_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$')
 THEN RETURN jsonb_build_object('error',400); END IF;
 SELECT count(*) INTO total_rows
 FROM vasra.kk_service_requests r
 JOIN vasra.kk_members m ON m.id=r.member_id
 LEFT JOIN vasra.kk_profiles p ON p.member_id=r.member_id
 WHERE r.status IN ('completed','rejected')
  AND (match_date='' OR to_char(
   (CASE WHEN r.status='completed' THEN coalesce(r.completed_at,r.reviewed_at,r.requested_at)
         ELSE coalesce(r.reviewed_at,r.requested_at) END) AT TIME ZONE 'Asia/Manila',
    'YYYY-MM-DD')=match_date)
  AND (match_text='' OR
   lower(concat_ws(' ',m.first_name,m.middle_name,m.last_name)) LIKE '%'||match_text||'%'
   OR lower(coalesce(p.kk_id,'')) LIKE '%'||match_text||'%'
   OR lower(r.id::text) LIKE '%'||match_text||'%'
   OR lower(r.service_type) LIKE '%'||match_text||'%'
   OR lower(r.status) LIKE '%'||match_text||'%'
   OR to_char(
     (CASE WHEN r.status='completed' THEN coalesce(r.completed_at,r.reviewed_at,r.requested_at)
           ELSE coalesce(r.reviewed_at,r.requested_at) END) AT TIME ZONE 'Asia/Manila',
     'YYYY-MM-DD') LIKE '%'||match_text||'%'
   OR to_char(
     (CASE WHEN r.status='completed' THEN coalesce(r.completed_at,r.reviewed_at,r.requested_at)
           ELSE coalesce(r.reviewed_at,r.requested_at) END) AT TIME ZONE 'Asia/Manila',
     'MM/DD/YYYY') LIKE '%'||match_text||'%'
   OR lower(to_char(
     (CASE WHEN r.status='completed' THEN coalesce(r.completed_at,r.reviewed_at,r.requested_at)
           ELSE coalesce(r.reviewed_at,r.requested_at) END) AT TIME ZONE 'Asia/Manila',
     'FMMonth FMDD, YYYY')) LIKE '%'||match_text||'%'
  );
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'member_id',r.member_id,'name',concat_ws(' ',m.first_name,m.middle_name,m.last_name),
  'kk_id',coalesce(p.kk_id,''),'email',m.email,'service_type',r.service_type,
  'details',r.details,'approved_details',r.approved_details,
  'effective_details',coalesce(r.approved_details,r.details),
  'status',r.status,'requested_at',r.requested_at,'reviewed_at',r.reviewed_at,
  'completed_at',r.completed_at,'review_note',r.review_note,'completed_note',r.completed_note,
  'reviewed_by',coalesce(u.name,''),'completed_by',coalesce(c.name,''),
  'verified_grams',r.verified_grams,'points_awarded',r.points_awarded
 ) ORDER BY r.processed_on DESC,r.id DESC),'[]'::jsonb) INTO result_rows
 FROM (
  SELECT r.*,
   CASE WHEN r.status='completed' THEN coalesce(r.completed_at,r.reviewed_at,r.requested_at)
        ELSE coalesce(r.reviewed_at,r.requested_at) END AS processed_on
  FROM vasra.kk_service_requests r
  JOIN vasra.kk_members m ON m.id=r.member_id
  LEFT JOIN vasra.kk_profiles p ON p.member_id=r.member_id
  WHERE r.status IN ('completed','rejected')
   AND (match_date='' OR to_char(
    (CASE WHEN r.status='completed' THEN coalesce(r.completed_at,r.reviewed_at,r.requested_at)
          ELSE coalesce(r.reviewed_at,r.requested_at) END) AT TIME ZONE 'Asia/Manila',
    'YYYY-MM-DD')=match_date)
   AND (match_text='' OR
    lower(concat_ws(' ',m.first_name,m.middle_name,m.last_name)) LIKE '%'||match_text||'%'
    OR lower(coalesce(p.kk_id,'')) LIKE '%'||match_text||'%'
    OR lower(r.id::text) LIKE '%'||match_text||'%'
    OR lower(r.service_type) LIKE '%'||match_text||'%'
    OR lower(r.status) LIKE '%'||match_text||'%'
    OR to_char(
      (CASE WHEN r.status='completed' THEN coalesce(r.completed_at,r.reviewed_at,r.requested_at)
            ELSE coalesce(r.reviewed_at,r.requested_at) END) AT TIME ZONE 'Asia/Manila',
      'YYYY-MM-DD') LIKE '%'||match_text||'%'
    OR to_char(
      (CASE WHEN r.status='completed' THEN coalesce(r.completed_at,r.reviewed_at,r.requested_at)
            ELSE coalesce(r.reviewed_at,r.requested_at) END) AT TIME ZONE 'Asia/Manila',
      'MM/DD/YYYY') LIKE '%'||match_text||'%'
    OR lower(to_char(
      (CASE WHEN r.status='completed' THEN coalesce(r.completed_at,r.reviewed_at,r.requested_at)
            ELSE coalesce(r.reviewed_at,r.requested_at) END) AT TIME ZONE 'Asia/Manila',
      'FMMonth FMDD, YYYY')) LIKE '%'||match_text||'%'
   )
  ORDER BY processed_on DESC,r.id DESC
  LIMIT page_limit OFFSET page_offset
 ) r
 JOIN vasra.kk_members m ON m.id=r.member_id
 LEFT JOIN vasra.kk_profiles p ON p.member_id=r.member_id
 LEFT JOIN vasra.users u ON u.id=r.reviewer_id
 LEFT JOIN vasra.users c ON c.id=r.completed_by;
 RETURN jsonb_build_object('ok',true,'total',total_rows,'requests',result_rows,
  'offset',page_offset,'limit',page_limit);
END $archive$;
REVOKE ALL ON FUNCTION public.vasra_kk_service_archive(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_service_archive(text,jsonb,text) TO service_role;