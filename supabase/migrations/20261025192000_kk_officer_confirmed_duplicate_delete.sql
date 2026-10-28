-- Allow only authenticated, active SK officers to delete duplicate KK entries.
-- Verify the complete profile name AND the exact unique confirmation phrase server-side.
-- Existing protected cascade, immutable audit entry and storage cleanup remain unchanged.
CREATE OR REPLACE FUNCTION public.vasra_kk_profile_delete(action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 staff vasra.users;
 target vasra.kk_members;
 target_id uuid;
 full_name text;
 private_file text;
 provided text;
BEGIN
 IF action <> 'delete' THEN RETURN jsonb_build_object('error',404); END IF;
 SELECT u.* INTO staff FROM vasra.users u
 JOIN vasra.sessions s ON s.user_id=u.id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
 AND u.disabled_at IS NULL AND NOT u.must_change AND u.role IN ('sk','chairman')
 LIMIT 1;
 IF staff.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF coalesce(payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN jsonb_build_object('error',400); END IF;
 target_id=(payload->>'id')::uuid;
 provided=btrim(coalesce(payload->>'confirm_name',''));
 IF length(provided)>200 OR provided='' THEN RETURN jsonb_build_object('error',400); END IF;
 SELECT * INTO target FROM vasra.kk_members WHERE id=target_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
 full_name=concat_ws(' ',nullif(btrim(target.first_name),''),
  nullif(btrim(target.middle_name),''),nullif(btrim(target.last_name),''));
 IF provided IS DISTINCT FROM full_name THEN RETURN jsonb_build_object('error',409); END IF;
 IF btrim(coalesce(payload->>'confirm_code','')) IS DISTINCT FROM
    'DELETE KK '||upper(left(target_id::text,8)) THEN RETURN jsonb_build_object('error',409); END IF;
 SELECT i.storage_path INTO private_file FROM vasra.kk_valid_ids i WHERE i.member_id=target_id;
 -- Related session, identity metadata, profile, redemptions, points, participation
 -- and service requests have ON DELETE CASCADE constraints.
 DELETE FROM vasra.kk_members WHERE id=target_id;
 INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
 VALUES(staff.id,staff.name,'kk_profile_deleted',target_id::text,
  jsonb_build_object('confirmed_by_authorized_sk_officer',true,'had_private_id',private_file IS NOT NULL));
 -- The private storage object must be removed only from the server after commit.
 RETURN jsonb_build_object('ok',true,'deleted_id',target_id,'storage_path',private_file);
END;
$function$
;
REVOKE ALL ON FUNCTION public.vasra_kk_profile_delete(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_profile_delete(text,jsonb,text) TO service_role;
