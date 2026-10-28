CREATE OR REPLACE FUNCTION public.vasra_kk_reward_delete(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE officer vasra.users; perk vasra.kk_perks; reward_id uuid;
BEGIN
 IF action <> 'delete' THEN RETURN jsonb_build_object('error',404); END IF;
 SELECT u.* INTO officer FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp() AND u.role='chairman'
 AND u.disabled_at IS NULL AND NOT u.must_change LIMIT 1;
 IF officer.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF coalesce(payload->>'id','') !~ '^[0-9a-f-]{36}$' THEN
  RETURN jsonb_build_object('error',400);
 END IF;
 reward_id=(payload->>'id')::uuid;
 SELECT * INTO perk FROM vasra.kk_perks WHERE id=reward_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
 IF EXISTS(SELECT 1 FROM vasra.kk_redemptions d WHERE d.perk_id=reward_id)
 THEN RETURN jsonb_build_object('error',409,'reason','reward_has_redemptions_disable_instead'); END IF;
 DELETE FROM vasra.kk_perks WHERE id=reward_id;
 INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
  VALUES(officer.id,officer.name,'kk_reward_deleted',reward_id::text,
   jsonb_build_object('title',perk.title,'quantity',perk.quantity));
 RETURN jsonb_build_object('ok',true,'deleted_id',reward_id);
END $$;
REVOKE ALL ON FUNCTION public.vasra_kk_reward_delete(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_reward_delete(text,jsonb,text) TO service_role;