-- Additive SK Services workflow upgrade: no existing request, member or points rows removed.
ALTER TABLE vasra.kk_service_requests
 ADD COLUMN IF NOT EXISTS approved_details jsonb,
 ADD COLUMN IF NOT EXISTS completed_at timestamptz,
 ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES vasra.users(id),
 ADD COLUMN IF NOT EXISTS completed_note text NOT NULL DEFAULT '';
ALTER TABLE vasra.kk_service_requests
 DROP CONSTRAINT IF EXISTS kk_service_requests_status_check;
ALTER TABLE vasra.kk_service_requests
 ADD CONSTRAINT kk_service_requests_status_check
 CHECK(status IN ('pending','approved','rejected','completed'));
CREATE INDEX IF NOT EXISTS kk_service_requested_time_idx
 ON vasra.kk_service_requests(requested_at DESC);
ALTER TABLE vasra.kk_service_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vasra.kk_service_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON vasra.kk_service_requests TO service_role;

CREATE OR REPLACE FUNCTION public.vasra_kk_service_workflow(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 actor vasra.users;
 r vasra.kk_service_requests;
 id_text text;
 decision text;
 note_text text;
 original jsonb;
 changed jsonb;
 paper text;
 ink text;
 page_count integer;
 copy_count integer;
 hours_count integer;
 grams_count integer;
 rate_count integer;
 award_count integer:=0;
BEGIN
 SELECT u.* INTO actor
 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
 AND u.role IN ('chairman','sk') AND u.disabled_at IS NULL AND NOT u.must_change
 LIMIT 1;
 IF actor.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;

 IF action='staff_list' THEN
  RETURN jsonb_build_object('ok',true,'requests',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'id',r.id,'member_id',r.member_id,'name',concat_ws(' ',m.first_name,m.middle_name,m.last_name),
    'kk_id',coalesce(p.kk_id,''),'email',m.email,
    'service_type',r.service_type,'details',r.details,
    'approved_details',r.approved_details,'effective_details',coalesce(r.approved_details,r.details),
    'status',r.status,'requested_at',r.requested_at,'reviewed_at',r.reviewed_at,
    'completed_at',r.completed_at,'review_note',r.review_note,'completed_note',r.completed_note,
    'reviewed_by',coalesce(u.name,''),'completed_by',coalesce(c.name,''),
    'verified_grams',r.verified_grams,'points_awarded',r.points_awarded
   ) ORDER BY r.requested_at DESC)
   FROM (SELECT * FROM vasra.kk_service_requests ORDER BY requested_at DESC LIMIT 3000) r
   JOIN vasra.kk_members m ON m.id=r.member_id
   LEFT JOIN vasra.kk_profiles p ON p.member_id=r.member_id
   LEFT JOIN vasra.users u ON u.id=r.reviewer_id
   LEFT JOIN vasra.users c ON c.id=r.completed_by
  ),'[]'::jsonb),
  'retabox_points_per_kg',coalesce((SELECT retabox_points_per_kg
     FROM vasra.kk_service_settings WHERE id=1),0));
 END IF;

 IF action NOT IN ('review','complete') THEN RETURN jsonb_build_object('error',404); END IF;
 id_text=coalesce(payload->>'id','');
 IF id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN jsonb_build_object('error',400); END IF;
 SELECT * INTO r FROM vasra.kk_service_requests WHERE id=id_text::uuid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
 note_text=btrim(coalesce(payload->>'note',''));
 IF length(note_text)>500 THEN RETURN jsonb_build_object('error',400); END IF;

 IF action='complete' THEN
  IF r.status<>'approved' THEN RETURN jsonb_build_object('error',409); END IF;
  UPDATE vasra.kk_service_requests
   SET status='completed',completed_at=clock_timestamp(),completed_by=actor.id,
       completed_note=note_text
   WHERE id=r.id;
  INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
   VALUES(actor.id,actor.name,'kk_service_completed',r.id::text,
    jsonb_build_object('service_type',r.service_type));
  RETURN jsonb_build_object('ok',true,'status','completed');
 END IF;

 decision=coalesce(payload->>'status','');
 IF r.status<>'pending' THEN RETURN jsonb_build_object('error',409); END IF;
 IF decision NOT IN ('approved','rejected') THEN RETURN jsonb_build_object('error',400); END IF;
 IF decision='rejected' AND length(note_text)<5 THEN RETURN jsonb_build_object('error',400); END IF;

 original=r.details;
 changed=payload->'approved_details';
 IF decision='approved' THEN
  IF r.service_type='printing' THEN
   IF jsonb_typeof(changed) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('error',400); END IF;
   paper=coalesce(changed->>'paper_size','');
   ink=coalesce(changed->>'color','');
   IF paper NOT IN ('short','long') OR ink NOT IN ('bw','colored')
    OR coalesce(changed->>'pages','') !~ '^[0-9]{1,3}$'
    OR coalesce(changed->>'copies','') !~ '^[0-9]{1,3}$'
    THEN RETURN jsonb_build_object('error',400); END IF;
   page_count=(changed->>'pages')::integer;copy_count=(changed->>'copies')::integer;
   IF page_count NOT BETWEEN 1 AND 100 OR copy_count NOT BETWEEN 1 AND 100
   THEN RETURN jsonb_build_object('error',400); END IF;
   changed=jsonb_build_object('paper_size',paper,'color',ink,
      'pages',page_count,'copies',copy_count);
  ELSIF r.service_type='computer' THEN
   IF jsonb_typeof(changed) IS DISTINCT FROM 'object' OR
    coalesce(changed->>'hours','') !~ '^[0-9]{1,2}$'
    THEN RETURN jsonb_build_object('error',400); END IF;
   hours_count=(changed->>'hours')::integer;
   IF hours_count NOT BETWEEN 1 AND 8 THEN RETURN jsonb_build_object('error',400); END IF;
   changed=jsonb_build_object('hours',hours_count);
  ELSE
   IF coalesce(payload->>'verified_grams','') !~ '^[0-9]{1,6}$'
   THEN RETURN jsonb_build_object('error',400); END IF;
   grams_count=(payload->>'verified_grams')::integer;
   IF grams_count NOT BETWEEN 1 AND 100000 THEN RETURN jsonb_build_object('error',400); END IF;
   SELECT retabox_points_per_kg INTO rate_count FROM vasra.kk_service_settings WHERE id=1;
   IF coalesce(rate_count,0)<=0 THEN RETURN jsonb_build_object('error',409,'reason','points_rate_not_configured'); END IF;
   award_count=floor(grams_count::numeric*rate_count/1000)::integer;
   IF award_count>500 THEN RETURN jsonb_build_object('error',400,'reason','points_limit_exceeded'); END IF;
   changed=original;
  END IF;
  UPDATE vasra.kk_service_requests
    SET status='approved',approved_details=changed,review_note=note_text,
        reviewed_at=clock_timestamp(),reviewer_id=actor.id,
        verified_grams=grams_count,points_awarded=award_count
    WHERE id=r.id;
  IF award_count>0 THEN
   INSERT INTO vasra.kk_points(member_id,delta,reason,staff_id,service_request_id)
    VALUES(r.member_id,award_count,'RetaBox donation: '||grams_count::text||' grams',actor.id,r.id);
  END IF;
 ELSE
  UPDATE vasra.kk_service_requests
   SET status='rejected',review_note=note_text,
       reviewed_at=clock_timestamp(),reviewer_id=actor.id
   WHERE id=r.id;
 END IF;
 INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
 VALUES(actor.id,actor.name,'kk_service_'||decision,r.id::text,
  jsonb_build_object('service_type',r.service_type,
   'corrected_request',decision='approved' AND original IS DISTINCT FROM changed,
   'awarded_points',award_count));
 RETURN jsonb_build_object('ok',true,'status',decision,'points_awarded',award_count);
END;
$fn$;

REVOKE ALL ON FUNCTION public.vasra_kk_service_workflow(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_service_workflow(text,jsonb,text) TO service_role;
