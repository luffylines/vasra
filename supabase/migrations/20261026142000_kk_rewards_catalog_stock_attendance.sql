-- SK VASRA · dedicated KK Rewards and confirmed project attendance.
-- No deletion of existing rewards/redemptions/points/registrations.
-- Rewards with no stock entered remain unavailable until Chairman enters inventory.
ALTER TABLE vasra.kk_perks
 ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS image_path text,
 ADD COLUMN IF NOT EXISTS image_mime text;
ALTER TABLE vasra.kk_perks DROP CONSTRAINT IF EXISTS kk_perks_quantity_valid;
ALTER TABLE vasra.kk_perks ADD CONSTRAINT kk_perks_quantity_valid CHECK(quantity BETWEEN 0 AND 100000);

CREATE TABLE IF NOT EXISTS vasra.kk_project_attendance (
 project_id uuid NOT NULL REFERENCES vasra.projects(id),
 member_id uuid NOT NULL REFERENCES vasra.kk_members(id),
 points integer NOT NULL CHECK(points BETWEEN 1 AND 500),
 officer_id uuid NOT NULL REFERENCES vasra.users(id),
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,member_id)
);
REVOKE ALL ON vasra.kk_project_attendance FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON vasra.kk_project_attendance TO service_role;

CREATE OR REPLACE FUNCTION public.vasra_kk_rewards(
 action text,payload jsonb DEFAULT '{}'::jsonb,session_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $rewards$
DECLARE
 officer vasra.users;
 kk vasra.kk_members;
 prof vasra.kk_profiles;
 perk vasra.kk_perks;
 claim vasra.kk_redemptions;
 member_row vasra.kk_members;
 item_id uuid;
 target_id uuid;
 project_ref uuid;
 amount integer;
 points_balance integer;
 points_reserved integer;
 reserved_stock integer;
 available_stock integer;
 new_id uuid;
 flag boolean;
 title_text text;
 description_text text;
 note_text text;
 file_text text;
 file_mime text;
BEGIN
 SELECT u.* INTO officer FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
 AND u.role IN ('sk','chairman') AND u.disabled_at IS NULL AND NOT u.must_change LIMIT 1;
 SELECT m.* INTO kk FROM vasra.kk_sessions s JOIN vasra.kk_members m ON m.id=s.member_id
 WHERE s.token_hash=session_hash AND s.expires>clock_timestamp() LIMIT 1;
 IF action IN ('staff_list','save','toggle','review','attendance_award','set_image','image_access') THEN
  IF officer.id IS NULL AND action<>'image_access' THEN RETURN jsonb_build_object('error',403); END IF;
 ELSIF action IN ('catalog','request') THEN
  IF kk.id IS NULL THEN RETURN jsonb_build_object('error',401); END IF;
  SELECT * INTO prof FROM vasra.kk_profiles WHERE member_id=kk.id;
  IF prof.status IS DISTINCT FROM 'verified' THEN RETURN jsonb_build_object('error',403); END IF;
 ELSE RETURN jsonb_build_object('error',404); END IF;

 IF action='staff_list' THEN
  RETURN jsonb_build_object(
   'officer',jsonb_build_object('id',officer.id,'name',officer.name,'chairman',officer.role='chairman'),
   'rewards',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',p.id,'title',p.title,'description',p.description,'cost',p.cost,'active',p.active,
     'quantity',p.quantity,'image',p.image_path IS NOT NULL,
     'claimed',coalesce((SELECT count(*) FROM vasra.kk_redemptions d WHERE d.perk_id=p.id AND d.status='approved'),0),
     'pending',coalesce((SELECT count(*) FROM vasra.kk_redemptions d WHERE d.perk_id=p.id AND d.status='pending'),0),
     'available',greatest(0,p.quantity-
       (SELECT count(*) FROM vasra.kk_redemptions d WHERE d.perk_id=p.id AND d.status IN ('pending','approved')))
     ) ORDER BY p.created_at DESC) FROM vasra.kk_perks p),'[]'::jsonb),
   'claims',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',d.id,'member_id',d.member_id,'name',concat_ws(' ',m.first_name,m.last_name),
     'kk_id',pr.kk_id,'perk_id',d.perk_id,'title',p.title,'cost',d.cost,
     'status',d.status,'note',d.note,'created_at',d.created_at,
     'reviewed_by',u.name,'reviewed_at',d.reviewed_at)
    ORDER BY d.created_at DESC)
    FROM vasra.kk_redemptions d JOIN vasra.kk_members m ON m.id=d.member_id
    JOIN vasra.kk_perks p ON p.id=d.perk_id
    LEFT JOIN vasra.kk_profiles pr ON pr.member_id=m.id
    LEFT JOIN vasra.users u ON u.id=d.reviewed_by),'[]'::jsonb),
   'projects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'status',p.status)
     ORDER BY p.created DESC) FROM vasra.projects p
    WHERE p.published AND (p.publish_at IS NULL OR p.publish_at<=clock_timestamp())
     AND p.status IN ('Pinaplano','Isinasagawa','Natapos')),'[]'::jsonb),
   'members',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'name',concat_ws(' ',m.first_name,m.last_name),'kk_id',pr.kk_id,
    'balance',coalesce((SELECT sum(delta) FROM vasra.kk_points q WHERE q.member_id=m.id),0)
   ) ORDER BY m.last_name,m.first_name)
     FROM vasra.kk_members m JOIN vasra.kk_profiles pr ON pr.member_id=m.id
     WHERE pr.status='verified'),'[]'::jsonb),
   'registrations',coalesce((SELECT jsonb_agg(jsonb_build_object('project_id',r.project_id,
     'member_id',r.member_id,'registered_at',r.registered_at))
     FROM vasra.kk_project_participation r),'[]'::jsonb),
   'attendance',coalesce((SELECT jsonb_agg(jsonb_build_object('project_id',a.project_id,
     'member_id',a.member_id,'points',a.points,'officer',u.name,'confirmed_at',a.confirmed_at))
     FROM vasra.kk_project_attendance a LEFT JOIN vasra.users u ON u.id=a.officer_id),'[]'::jsonb)
  );
 END IF;

 IF action='catalog' THEN
  SELECT coalesce(sum(delta),0) INTO points_balance FROM vasra.kk_points WHERE member_id=kk.id;
  SELECT coalesce(sum(cost),0) INTO points_reserved FROM vasra.kk_redemptions
    WHERE member_id=kk.id AND status='pending';
  RETURN jsonb_build_object('balance',points_balance,'reserved',points_reserved,
   'available_points',greatest(0,points_balance-points_reserved),
   'rewards',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',p.id,'title',p.title,'description',p.description,'cost',p.cost,
    'image',p.image_path IS NOT NULL,'quantity',p.quantity,
    'claimed',(SELECT count(*) FROM vasra.kk_redemptions d WHERE d.perk_id=p.id AND d.status='approved'),
    'available',greatest(0,p.quantity-(SELECT count(*) FROM vasra.kk_redemptions d
       WHERE d.perk_id=p.id AND d.status IN ('pending','approved')))
    ) ORDER BY p.created_at DESC) FROM vasra.kk_perks p WHERE p.active),'[]'::jsonb),
   'claims',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'title',p.title,
     'cost',d.cost,'status',d.status,'created_at',d.created_at,'note',d.note)
     ORDER BY d.created_at DESC)
      FROM vasra.kk_redemptions d JOIN vasra.kk_perks p ON p.id=d.perk_id
      WHERE d.member_id=kk.id),'[]'::jsonb));
 END IF;

 IF action='image_access' THEN
  IF officer.id IS NULL AND kk.id IS NULL THEN RETURN jsonb_build_object('error',401); END IF;
  IF coalesce(payload->>'id','') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN RETURN jsonb_build_object('error',400); END IF;
  SELECT * INTO perk FROM vasra.kk_perks WHERE id=(payload->>'id')::uuid;
  IF NOT FOUND OR perk.image_path IS NULL THEN RETURN jsonb_build_object('error',404); END IF;
  IF officer.id IS NULL AND NOT perk.active THEN RETURN jsonb_build_object('error',403); END IF;
  RETURN jsonb_build_object('ok',true,'path',perk.image_path,'mime',perk.image_mime);
 END IF;

 IF action='save' THEN
  IF officer.role IS DISTINCT FROM 'chairman' THEN RETURN jsonb_build_object('error',403); END IF;
  title_text=btrim(coalesce(payload->>'title',''));
  description_text=btrim(coalesce(payload->>'description',''));
  IF length(title_text) NOT BETWEEN 3 AND 120 OR length(description_text)>500
     OR coalesce(payload->>'cost','') !~ '^[0-9]{1,5}$'
     OR coalesce(payload->>'quantity','') !~ '^[0-9]{1,6}$'
   THEN RETURN jsonb_build_object('error',400); END IF;
  amount=(payload->>'cost')::integer;
  IF amount NOT BETWEEN 1 AND 10000 OR (payload->>'quantity')::integer NOT BETWEEN 0 AND 100000
   THEN RETURN jsonb_build_object('error',400); END IF;
  IF coalesce(payload->>'id','')='' THEN
   INSERT INTO vasra.kk_perks(title,description,cost,active,quantity,updated_by)
    VALUES(title_text,description_text,amount,false,(payload->>'quantity')::int,officer.id)
    RETURNING id INTO item_id;
  ELSE
   item_id=(payload->>'id')::uuid;
   SELECT * INTO perk FROM vasra.kk_perks WHERE id=item_id FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
   IF (payload->>'quantity')::integer <
      (SELECT count(*) FROM vasra.kk_redemptions d WHERE d.perk_id=item_id
        AND d.status IN ('pending','approved'))
    THEN RETURN jsonb_build_object('error',409,'reason','insufficient_inventory_for_existing_claims'); END IF;
   UPDATE vasra.kk_perks SET title=title_text,description=description_text,cost=amount,
    quantity=(payload->>'quantity')::int,updated_by=officer.id
    WHERE id=item_id;
  END IF;
  INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
    VALUES(officer.id,officer.name,'kk_reward_saved',item_id::text,
      jsonb_build_object('title',title_text,'points',amount));
  RETURN jsonb_build_object('ok',true,'id',item_id);
 END IF;

 IF action='toggle' THEN
  IF officer.role IS DISTINCT FROM 'chairman' THEN RETURN jsonb_build_object('error',403); END IF;
  item_id=(payload->>'id')::uuid;
  SELECT * INTO perk FROM vasra.kk_perks WHERE id=item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
  flag=coalesce((payload->>'active')::boolean,false);
  IF flag AND (perk.image_path IS NULL OR perk.quantity<=0)
   THEN RETURN jsonb_build_object('error',409,'reason','reward_photo_and_stock_required'); END IF;
  UPDATE vasra.kk_perks SET active=flag,updated_by=officer.id WHERE id=item_id;
  INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
    VALUES(officer.id,officer.name,CASE WHEN flag THEN 'kk_reward_published' ELSE 'kk_reward_disabled' END,
     item_id::text,jsonb_build_object('title',perk.title));
  RETURN jsonb_build_object('ok',true);
 END IF;

 IF action='set_image' THEN
  IF officer.role IS DISTINCT FROM 'chairman' THEN RETURN jsonb_build_object('error',403); END IF;
  item_id=(payload->>'id')::uuid;
  file_text=coalesce(payload->>'path','');
  file_mime=coalesce(payload->>'mime','');
  IF file_text !~ '^rewards/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
     OR file_mime NOT IN ('image/jpeg','image/png','image/webp')
   THEN RETURN jsonb_build_object('error',400); END IF;
  UPDATE vasra.kk_perks SET image_path=file_text,image_mime=file_mime,updated_by=officer.id
   WHERE id=item_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;

 IF action='request' THEN
  item_id=(payload->>'id')::uuid;
  SELECT * INTO perk FROM vasra.kk_perks WHERE id=item_id FOR UPDATE;
  IF NOT FOUND OR NOT perk.active THEN RETURN jsonb_build_object('error',404); END IF;
  SELECT * INTO member_row FROM vasra.kk_members WHERE id=kk.id FOR UPDATE;
  SELECT coalesce(sum(delta),0) INTO points_balance FROM vasra.kk_points WHERE member_id=kk.id;
  SELECT coalesce(sum(cost),0) INTO points_reserved FROM vasra.kk_redemptions WHERE member_id=kk.id AND status='pending';
  SELECT count(*) INTO reserved_stock FROM vasra.kk_redemptions d
    WHERE d.perk_id=item_id AND d.status IN ('pending','approved');
  IF reserved_stock>=perk.quantity THEN RETURN jsonb_build_object('error',409,'reason','sold_out'); END IF;
  IF points_balance-points_reserved<perk.cost THEN RETURN jsonb_build_object('error',409,'reason','insufficient_points'); END IF;
  IF EXISTS(SELECT 1 FROM vasra.kk_redemptions d WHERE d.perk_id=item_id
    AND d.member_id=kk.id AND d.status='pending') THEN RETURN jsonb_build_object('error',409,'reason','already_requested'); END IF;
  INSERT INTO vasra.kk_redemptions(member_id,perk_id,cost,status)
   VALUES(kk.id,item_id,perk.cost,'pending') RETURNING id INTO new_id;
  RETURN jsonb_build_object('ok',true,'id',new_id);
 END IF;

 IF action='review' THEN
  item_id=(payload->>'id')::uuid;
  SELECT p.* INTO perk FROM vasra.kk_perks p JOIN vasra.kk_redemptions d ON d.perk_id=p.id
   WHERE d.id=item_id FOR UPDATE OF p;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
  SELECT * INTO claim FROM vasra.kk_redemptions WHERE id=item_id FOR UPDATE;
  IF claim.status<>'pending' OR payload->>'decision' NOT IN ('approved','rejected')
   THEN RETURN jsonb_build_object('error',409); END IF;
  SELECT * INTO member_row FROM vasra.kk_members WHERE id=claim.member_id FOR UPDATE;
  IF payload->>'decision'='approved' THEN
   SELECT coalesce(sum(delta),0) INTO points_balance FROM vasra.kk_points WHERE member_id=claim.member_id;
   IF points_balance<claim.cost THEN RETURN jsonb_build_object('error',409,'reason','insufficient_points'); END IF;
   SELECT count(*) INTO reserved_stock FROM vasra.kk_redemptions WHERE perk_id=perk.id AND status='approved';
   IF reserved_stock>=perk.quantity THEN RETURN jsonb_build_object('error',409,'reason','sold_out'); END IF;
  END IF;
  note_text=left(btrim(coalesce(payload->>'note','')),500);
  UPDATE vasra.kk_redemptions SET status=payload->>'decision',note=note_text,
   reviewed_by=officer.id,reviewed_at=clock_timestamp() WHERE id=item_id;
  IF payload->>'decision'='approved' THEN
   INSERT INTO vasra.kk_points(member_id,delta,reason,staff_id,redemption_id)
     VALUES(claim.member_id,-claim.cost,'KK reward redeemed: '||perk.title,officer.id,claim.id);
  END IF;
  INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
    VALUES(officer.id,officer.name,'kk_reward_'||(payload->>'decision'),claim.id::text,
      jsonb_build_object('member_id',claim.member_id,'cost',claim.cost,'reward_id',perk.id));
  RETURN jsonb_build_object('ok',true);
 END IF;

 IF action='attendance_award' THEN
  IF coalesce(payload->>'project_id','') !~* '^[0-9a-f-]{36}$' OR
    coalesce(payload->>'member_id','') !~* '^[0-9a-f-]{36}$' OR
    coalesce(payload->>'points','') !~ '^[0-9]{1,3}$'
   THEN RETURN jsonb_build_object('error',400); END IF;
  project_ref=(payload->>'project_id')::uuid;
  target_id=(payload->>'member_id')::uuid;
  amount=(payload->>'points')::integer;
  IF amount NOT BETWEEN 1 AND 500 THEN RETURN jsonb_build_object('error',400); END IF;
  IF NOT EXISTS(SELECT 1 FROM vasra.projects p WHERE p.id=project_ref AND p.published
     AND (p.publish_at IS NULL OR p.publish_at<=clock_timestamp())
     AND p.status IN ('Isinasagawa','Natapos'))
   THEN RETURN jsonb_build_object('error',409,'reason','project_not_active_or_completed'); END IF;
  SELECT * INTO prof FROM vasra.kk_profiles WHERE member_id=target_id FOR UPDATE;
  IF prof.status IS DISTINCT FROM 'verified' THEN RETURN jsonb_build_object('error',403); END IF;
  INSERT INTO vasra.kk_project_attendance(project_id,member_id,points,officer_id)
    VALUES(project_ref,target_id,amount,officer.id) ON CONFLICT DO NOTHING RETURNING member_id INTO new_id;
  IF new_id IS NULL THEN RETURN jsonb_build_object('error',409,'reason','already_awarded'); END IF;
  INSERT INTO vasra.kk_points(member_id,delta,reason,staff_id)
   VALUES(target_id,amount,'Project participation: '||
       (SELECT left(title,120) FROM vasra.projects WHERE id=project_ref),officer.id);
  INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
   VALUES(officer.id,officer.name,'kk_project_attendance_awarded',target_id::text,
     jsonb_build_object('project_id',project_ref,'points',amount));
  RETURN jsonb_build_object('ok',true,'awarded',amount);
 END IF;
 RETURN jsonb_build_object('error',404);
END;
$rewards$;
REVOKE ALL ON FUNCTION public.vasra_kk_rewards(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_rewards(text,jsonb,text) TO service_role;
