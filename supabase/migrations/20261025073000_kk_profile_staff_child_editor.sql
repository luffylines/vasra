-- Secure staff-only KK profile editor (adds functionality without modifying existing records).
-- Changes use allowed keys per card, locked profile row, and privacy-safe audit metadata.
CREATE OR REPLACE FUNCTION public.vasra_kk_profile_editor(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT null)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 staff vasra.users;
 profile_row vasra.kk_profiles;
 member_id uuid;
 section_name text;
 updates jsonb;
 allowed text[];
 field_name text;
 field_value text;
 patch jsonb:='{}'::jsonb;
 changed_keys text[]:=ARRAY[]::text[];
BEGIN
 IF action <> 'update' THEN RETURN jsonb_build_object('error',404); END IF;
 SELECT u.* INTO staff FROM vasra.users u
 JOIN vasra.sessions s ON s.user_id=u.id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
 AND u.disabled_at IS NULL AND NOT u.must_change
 AND u.role IN ('sk','chairman') LIMIT 1;
 IF staff.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF coalesce(payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN jsonb_build_object('error',400); END IF;
 member_id=(payload->>'id')::uuid;
 section_name=coalesce(payload->>'section','');
 updates=payload->'changes';
 IF jsonb_typeof(updates) IS DISTINCT FROM 'object'
 OR length(updates::text)>4000 THEN RETURN jsonb_build_object('error',400); END IF;
 allowed=CASE section_name
  WHEN 'personal' THEN ARRAY['gender','civil_status','solo_parent','family_count','religion','siblings']
  WHEN 'address' THEN ARRAY['residence_region','residence_city','residence_province','residence_barangay','sitio_id','street','address_line_2']
  WHEN 'education' THEN ARRAY['education','school_name','year_level','employment','education_status','course_program']
  WHEN 'additional' THEN ARRAY['sk_voter','national_voter','voted_last_election','kk_assembly','interests']
  WHEN 'emergency' THEN ARRAY['emergency_name','emergency_phone','emergency_relation']
  ELSE NULL END;
 IF allowed IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_object_keys(updates))
 THEN RETURN jsonb_build_object('error',400); END IF;
 SELECT * INTO profile_row FROM vasra.kk_profiles
 WHERE vasra.kk_profiles.member_id=member_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
 FOR field_name,field_value IN SELECT e.key,e.value FROM jsonb_each_text(updates) AS e(key,value)
 LOOP
  IF NOT field_name=ANY(allowed) OR length(field_value)>160
  OR field_name IN ('email','password_hash','kk_id','status','reviewer_id') THEN
   RETURN jsonb_build_object('error',400);
  END IF;
  IF field_name IN ('sk_voter','national_voter','voted_last_election','kk_assembly')
  AND field_value NOT IN ('yes','no') THEN RETURN jsonb_build_object('error',400); END IF;
  IF field_name='solo_parent' AND field_value NOT IN ('yes','no','undisclosed','')
  THEN RETURN jsonb_build_object('error',400); END IF;
  IF field_name IN ('family_count','siblings') AND field_value!~'^[0-9]{1,2}$'
  THEN RETURN jsonb_build_object('error',400); END IF;
  IF field_name='family_count' AND field_value::integer NOT BETWEEN 1 AND 99
  THEN RETURN jsonb_build_object('error',400); END IF;
  IF field_name='sitio_id' AND field_value<>'' AND NOT EXISTS(
   SELECT 1 FROM vasra.kk_sitios s WHERE s.id::text=field_value
  ) THEN RETURN jsonb_build_object('error',400); END IF;
  IF field_name='sitio_id' AND field_value='' AND profile_row.status='verified'
  THEN RETURN jsonb_build_object('error',400); END IF;
  patch=patch||jsonb_build_object(field_name,field_value);
  changed_keys=array_append(changed_keys,field_name);
 END LOOP;
 UPDATE vasra.kk_profiles SET profile=coalesce(profile,'{}'::jsonb)||patch,
  updated_at=clock_timestamp() WHERE vasra.kk_profiles.member_id=member_id;
 INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
 VALUES(staff.id,staff.name,'kk_profile_field_corrected',member_id::text,
  jsonb_build_object('section',section_name,'changed_keys',to_jsonb(changed_keys)));
 RETURN jsonb_build_object('ok',true,'member_id',member_id,'section',section_name);
END;
$$;
REVOKE ALL ON FUNCTION public.vasra_kk_profile_editor(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_profile_editor(text,jsonb,text) TO service_role;
