-- SK VASRA secure staff QR scanning: QR contains only the public KK ID.
-- Service role only; no QR string is treated as proof of identity or staff authorization.
-- Requests, points and audit remain under existing staff workflow.
ALTER TABLE vasra.kk_service_requests ADD COLUMN IF NOT EXISTS staff_entry_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS kk_service_requests_staff_entry_key_uidx
  ON vasra.kk_service_requests(staff_entry_key) WHERE staff_entry_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.vasra_kk_service_scan(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $scan$
DECLARE
 officer vasra.users;
 member_row record;
 printed_id text;
 request_kind text;
 request_details jsonb;
 officer_note text;
 entry_key uuid;
 existing_id uuid;
 new_id uuid;
 outcome jsonb;
 finish_result jsonb;
 paper text;
 ink text;
 pages_count integer;
 copies_count integer;
 hours_count integer;
 grams_count integer;
 rate_count integer;
BEGIN
 SELECT u.* INTO officer FROM vasra.sessions s
 JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
   AND u.role IN ('sk','chairman')
   AND u.disabled_at IS NULL AND NOT u.must_change LIMIT 1;
 IF officer.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;

 printed_id=upper(btrim(coalesce(payload->>'kk_id','')));
 IF printed_id !~ '^VASRA-KK-[0-9]{1,10}$'
 THEN RETURN jsonb_build_object('error',400,'reason','invalid_kk_id'); END IF;
 SELECT p.member_id,p.kk_id,
    concat_ws(' ',m.first_name,nullif(m.middle_name,''),m.last_name) AS member_name
 INTO member_row
 FROM vasra.kk_profiles p JOIN vasra.kk_members m ON m.id=p.member_id
 WHERE p.kk_id=printed_id AND p.status='verified'
 LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('error',404,'reason','unverified_or_unknown_id'); END IF;

 IF action='lookup' THEN
   RETURN jsonb_build_object('ok',true,
     'member',jsonb_build_object('id',member_row.member_id,'kk_id',member_row.kk_id,'name',member_row.member_name),
     'officer',jsonb_build_object('name',officer.name),
     'pending',coalesce((
       SELECT jsonb_agg(jsonb_build_object(
        'id',r.id,'service_type',r.service_type,'status',r.status,
        'details',r.details,'requested_at',r.requested_at) ORDER BY r.requested_at DESC)
       FROM vasra.kk_service_requests r
       WHERE r.member_id=member_row.member_id AND r.status='pending'
     ),'[]'::jsonb));
 END IF;
 IF action<>'walkin_complete' THEN RETURN jsonb_build_object('error',404); END IF;

 request_kind=coalesce(payload->>'service_type','');
 IF request_kind NOT IN ('printing','computer','retabox')
 THEN RETURN jsonb_build_object('error',400,'reason','invalid_service'); END IF;
 IF jsonb_typeof(payload->'details') IS DISTINCT FROM 'object'
 THEN RETURN jsonb_build_object('error',400,'reason','missing_details'); END IF;
 request_details=payload->'details';
 officer_note=btrim(coalesce(payload->>'note',''));
 IF length(officer_note)>500 THEN RETURN jsonb_build_object('error',400); END IF;
 IF coalesce(payload->>'entry_key','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN jsonb_build_object('error',400,'reason','missing_request_key'); END IF;
 entry_key=(payload->>'entry_key')::uuid;

 -- Validate ranges before writing; existing review workflow revalidates and audits.
 IF request_kind='printing' THEN
   paper=coalesce(request_details->>'paper_size','');
   ink=coalesce(request_details->>'color','');
   IF paper NOT IN ('short','long') OR ink NOT IN ('bw','colored')
     OR coalesce(request_details->>'pages','') !~ '^[0-9]{1,3}$'
     OR coalesce(request_details->>'copies','') !~ '^[0-9]{1,3}$'
   THEN RETURN jsonb_build_object('error',400,'reason','invalid_printing_details'); END IF;
   pages_count=(request_details->>'pages')::int;
   copies_count=(request_details->>'copies')::int;
   IF pages_count NOT BETWEEN 1 AND 100 OR copies_count NOT BETWEEN 1 AND 100
   THEN RETURN jsonb_build_object('error',400); END IF;
   request_details=jsonb_build_object('paper_size',paper,'color',ink,
       'pages',pages_count,'copies',copies_count);
 ELSIF request_kind='computer' THEN
   IF coalesce(request_details->>'hours','') !~ '^[0-9]{1,2}$'
   THEN RETURN jsonb_build_object('error',400,'reason','invalid_computer_hours'); END IF;
   hours_count=(request_details->>'hours')::int;
   IF hours_count NOT BETWEEN 1 AND 8 THEN RETURN jsonb_build_object('error',400); END IF;
   request_details=jsonb_build_object('hours',hours_count);
 ELSE
   IF coalesce(request_details->>'grams','') !~ '^[0-9]{1,6}$'
   THEN RETURN jsonb_build_object('error',400,'reason','invalid_donation_weight'); END IF;
   grams_count=(request_details->>'grams')::int;
   IF grams_count NOT BETWEEN 1 AND 100000 THEN RETURN jsonb_build_object('error',400); END IF;
   SELECT retabox_points_per_kg INTO rate_count FROM vasra.kk_service_settings WHERE id=1;
   IF coalesce(rate_count,0)<=0 THEN RETURN jsonb_build_object('error',409,'reason','points_rate_not_configured'); END IF;
   IF floor(grams_count::numeric*rate_count/1000)>500
   THEN RETURN jsonb_build_object('error',400,'reason','points_limit_exceeded'); END IF;
   request_details=jsonb_build_object('grams',grams_count);
 END IF;

 -- Repeated submissions with the same key return the prior result, not another record.
 SELECT r.id INTO existing_id
 FROM vasra.kk_service_requests r WHERE r.staff_entry_key=entry_key;
 IF FOUND THEN
   IF NOT EXISTS(SELECT 1 FROM vasra.kk_service_requests r
     WHERE r.id=existing_id AND r.member_id=member_row.member_id AND r.service_type=request_kind)
   THEN RETURN jsonb_build_object('error',409); END IF;
   RETURN jsonb_build_object('ok',true,'id',existing_id,'duplicate',true);
 END IF;
 INSERT INTO vasra.kk_service_requests(member_id,service_type,details,status,staff_entry_key)
 VALUES(member_row.member_id,request_kind,request_details,'pending',entry_key)
 ON CONFLICT DO NOTHING RETURNING id INTO new_id;
 IF new_id IS NULL THEN
   SELECT r.id INTO existing_id FROM vasra.kk_service_requests r
    WHERE r.staff_entry_key=entry_key AND r.member_id=member_row.member_id AND r.service_type=request_kind;
   IF existing_id IS NULL THEN RETURN jsonb_build_object('error',409); END IF;
   RETURN jsonb_build_object('ok',true,'id',existing_id,'duplicate',true);
 END IF;

 outcome=public.vasra_kk_service_workflow('review',
    jsonb_build_object('id',new_id,'status','approved','note',officer_note,
       'approved_details',request_details,'verified_grams',grams_count),
    session_hash);
 IF coalesce((outcome->>'ok')::boolean,false) IS NOT TRUE
 THEN RAISE EXCEPTION 'Unable to approve staff service entry (%).',coalesce(outcome->>'error','invalid') USING ERRCODE='P0001'; END IF;
 finish_result=public.vasra_kk_service_workflow('complete',
    jsonb_build_object('id',new_id,'note',officer_note),session_hash);
 IF coalesce((finish_result->>'ok')::boolean,false) IS NOT TRUE
 THEN RAISE EXCEPTION 'Unable to complete staff service entry.' USING ERRCODE='P0001'; END IF;
 RETURN jsonb_build_object('ok',true,'id',new_id,'status','completed',
    'member',jsonb_build_object('kk_id',member_row.kk_id,'name',member_row.member_name),
    'officer',officer.name,'points_awarded',coalesce((outcome->>'points_awarded')::int,0));
END;
$scan$;
REVOKE ALL ON FUNCTION public.vasra_kk_service_scan(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_service_scan(text,jsonb,text) TO service_role;
