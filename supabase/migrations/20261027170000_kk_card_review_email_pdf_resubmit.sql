-- SK VASRA: KK photo re-upload + notification outbox for SK card reviews.
-- STAGED ONLY. This migration must be reviewed before applying to live Supabase.
-- Existing verified member status, points and historical card audit stay unchanged.
CREATE OR REPLACE FUNCTION public.vasra_kk_card(action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 m vasra.kk_members;
 officer vasra.users;
 pr vasra.kk_profiles;
 card vasra.kk_id_cards;
 target_id uuid;
 new_status text;
 reason text;
BEGIN
 IF action IN ('my_card','photo_save','my_photo_access') THEN
  SELECT u.* INTO m FROM vasra.kk_sessions s JOIN vasra.kk_members u ON u.id=s.member_id
   WHERE s.token_hash=session_hash AND s.expires>clock_timestamp() LIMIT 1;
  IF m.id IS NULL THEN RETURN jsonb_build_object('error',401); END IF;
  SELECT * INTO pr FROM vasra.kk_profiles WHERE member_id=m.id;
  IF pr.status<>'verified' THEN RETURN jsonb_build_object('error',403); END IF;
  IF action='my_card' THEN
   SELECT * INTO card FROM vasra.kk_id_cards WHERE member_id=m.id;
   RETURN jsonb_build_object('ok',true,'kk_id',pr.kk_id,'photo_exists',card.member_id IS NOT NULL,
    'status',coalesce(card.status,'not_uploaded'),'review_note',coalesce(card.review_note,''),
    'uploaded_at',card.uploaded_at,'printed_at',card.printed_at,'print_count',coalesce(card.print_count,0),
    'birthdate',m.birthdate,'name',concat_ws(' ',m.first_name,nullif(m.middle_name,''),m.last_name),
    'first_name',m.first_name,'middle_name',m.middle_name,'last_name',m.last_name,
    'issued_at',card.reviewed_at,
    'gender',coalesce(pr.profile->>'gender',''),'street',coalesce(pr.profile->>'street',''),
    'barangay',coalesce(pr.profile->>'residence_barangay','Vasra'),
    'city',coalesce(pr.profile->>'residence_city','Quezon City'));
  END IF;
  IF action='photo_save' THEN
   -- Never let an approved card be silently replaced by a new upload.
   SELECT * INTO card FROM vasra.kk_id_cards WHERE member_id=m.id FOR UPDATE;
   IF FOUND AND card.status='approved' THEN
    RETURN jsonb_build_object('error',409,'reason','already_approved');
   END IF;
   IF coalesce(payload->>'path','') !~ ('^cards/'||m.id::text||'/[0-9a-f-]{36}[.](jpg|png|webp)$')
    OR coalesce(payload->>'mime','') NOT IN ('image/jpeg','image/png','image/webp')
    OR length(coalesce(payload->>'name','')) NOT BETWEEN 3 AND 120
   THEN RETURN jsonb_build_object('error',400); END IF;
   INSERT INTO vasra.kk_id_cards(member_id,storage_path,file_name,mime,status,review_note,uploaded_at,reviewed_at,reviewed_by)
    VALUES(m.id,payload->>'path',payload->>'name',payload->>'mime','pending','',clock_timestamp(),NULL,NULL)
    ON CONFLICT(member_id) DO UPDATE SET
      storage_path=excluded.storage_path,file_name=excluded.file_name,mime=excluded.mime,
      status='pending',review_note='',uploaded_at=clock_timestamp(),reviewed_at=NULL,reviewed_by=NULL,
      printed_at=NULL,printed_by=NULL,print_count=0;
   INSERT INTO vasra.kk_id_card_audit(member_id,action) VALUES(m.id,'photo_uploaded');
   RETURN jsonb_build_object('ok',true,'status','pending');
  END IF;
  SELECT * INTO card FROM vasra.kk_id_cards WHERE member_id=m.id;
  IF card.member_id IS NULL THEN RETURN jsonb_build_object('error',404); END IF;
  RETURN jsonb_build_object('ok',true,'path',card.storage_path,'mime',card.mime);
 END IF;
 SELECT u.* INTO officer FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
  WHERE s.token=session_hash AND s.expires>clock_timestamp() AND u.role IN ('chairman','sk')
    AND u.disabled_at IS NULL AND NOT u.must_change LIMIT 1;
 IF officer.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF action='staff_list' THEN
  RETURN jsonb_build_object('ok',true,'members',coalesce((
   SELECT jsonb_agg(jsonb_build_object('member_id',u.id,'kk_id',p.kk_id,
    'name',concat_ws(' ',u.first_name,nullif(u.middle_name,''),u.last_name),
    'first_name',u.first_name,'middle_name',u.middle_name,'last_name',u.last_name,
    'issued_at',c.reviewed_at,
    'birthdate',u.birthdate,'status',coalesce(c.status,'not_uploaded'),
    'photo_exists',c.member_id IS NOT NULL,'uploaded_at',c.uploaded_at,
    'printed_at',c.printed_at,'print_count',coalesce(c.print_count,0),
    'gender',coalesce(p.profile->>'gender',''),'street',coalesce(p.profile->>'street',''),
    'barangay',coalesce(p.profile->>'residence_barangay','Vasra'),
    'city',coalesce(p.profile->>'residence_city','Quezon City'),
    'reviewed_at',c.reviewed_at,'review_note',coalesce(c.review_note,''))
    ORDER BY c.uploaded_at DESC NULLS LAST,p.reviewed_at DESC NULLS LAST)
   FROM vasra.kk_members u JOIN vasra.kk_profiles p ON p.member_id=u.id
   LEFT JOIN vasra.kk_id_cards c ON c.member_id=u.id WHERE p.status='verified'
  ),'[]'::jsonb));
 END IF;
 IF coalesce(payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN jsonb_build_object('error',400); END IF;
 target_id=(payload->>'id')::uuid;
 SELECT * INTO card FROM vasra.kk_id_cards WHERE member_id=target_id FOR UPDATE;
 IF card.member_id IS NULL THEN RETURN jsonb_build_object('error',404); END IF;
 IF action='staff_print' THEN
  IF card.status<>'approved' THEN RETURN jsonb_build_object('error',409); END IF;
  UPDATE vasra.kk_id_cards
    SET printed_at=clock_timestamp(),printed_by=officer.id,
        print_count=coalesce(print_count,0)+1
    WHERE member_id=target_id RETURNING * INTO card;
  INSERT INTO vasra.kk_id_card_audit(member_id,officer_id,action)
    VALUES(target_id,officer.id,'printed');
  RETURN jsonb_build_object('ok',true,'printed_at',card.printed_at,'print_count',card.print_count);
 END IF;
 IF action='staff_photo_access' THEN
  RETURN jsonb_build_object('ok',true,'path',card.storage_path,'mime',card.mime);
 END IF;
 IF action='staff_review' THEN
  new_status=coalesce(payload->>'status','');
  reason=left(btrim(coalesce(payload->>'note','')),400);
  IF card.status<>'pending' OR new_status NOT IN ('approved','rejected') OR
   (new_status='rejected' AND length(reason)<5)
  THEN RETURN jsonb_build_object('error',409); END IF;
  UPDATE vasra.kk_id_cards SET status=new_status,review_note=reason,
    reviewed_by=officer.id,reviewed_at=clock_timestamp() WHERE member_id=target_id;
  INSERT INTO vasra.kk_id_card_audit(member_id,officer_id,action) VALUES(target_id,officer.id,new_status);
  RETURN jsonb_build_object('ok',true,'status',new_status);
 END IF;
 RETURN jsonb_build_object('error',404);
END;$function$;


CREATE TABLE IF NOT EXISTS vasra.kk_card_review_mail (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES vasra.kk_members(id) ON DELETE CASCADE,
 card_path text NOT NULL,
 recipient_email text NOT NULL,
 kk_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approved','rejected')),
 review_note text NOT NULL DEFAULT '',
 pdf_path text,
 delivery_state text NOT NULL DEFAULT 'pending'
   CHECK(delivery_state IN ('pending','sending','accepted')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 claim_nonce uuid,
 lease_until timestamptz,
 accepted_at timestamptz,
 provider_email_id text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(member_id,card_path)
);
ALTER TABLE vasra.kk_card_review_mail ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vasra.kk_card_review_mail FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON vasra.kk_card_review_mail TO service_role;

CREATE OR REPLACE FUNCTION vasra.kk_enqueue_card_review_mail()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $queue$
BEGIN
 IF OLD.status='pending' AND NEW.status IN ('approved','rejected') THEN
   INSERT INTO vasra.kk_card_review_mail
     (member_id,card_path,recipient_email,kk_id,decision,review_note)
   SELECT NEW.member_id,NEW.storage_path,u.email,p.kk_id,NEW.status,NEW.review_note
   FROM vasra.kk_members u JOIN vasra.kk_profiles p ON p.member_id=u.id
   WHERE u.id=NEW.member_id AND p.status='verified'
   ON CONFLICT(member_id,card_path) DO NOTHING;
 END IF;
 RETURN NEW;
END
$queue$;
DROP TRIGGER IF EXISTS kk_card_review_mail_after_review ON vasra.kk_id_cards;
CREATE TRIGGER kk_card_review_mail_after_review
 AFTER UPDATE OF status ON vasra.kk_id_cards
 FOR EACH ROW EXECUTE FUNCTION vasra.kk_enqueue_card_review_mail();

-- An ID approved before this queue existed should remain eligible for a
-- staff-triggered one-time send. Backfill is queue-only: it sends no emails.
INSERT INTO vasra.kk_card_review_mail
 (member_id,card_path,recipient_email,kk_id,decision,review_note)
SELECT c.member_id,c.storage_path,u.email,p.kk_id,c.status,coalesce(c.review_note,'')
FROM vasra.kk_id_cards c
JOIN vasra.kk_members u ON u.id=c.member_id
JOIN vasra.kk_profiles p ON p.member_id=c.member_id
WHERE p.status='verified' AND c.status IN ('approved','rejected')
  AND nullif(c.storage_path,'') IS NOT NULL
  AND nullif(btrim(u.email),'') IS NOT NULL
ON CONFLICT(member_id,card_path) DO NOTHING;

CREATE OR REPLACE FUNCTION public.vasra_kk_card_mail(
 action text,payload jsonb DEFAULT '{}'::jsonb,session_hash text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $mail$
DECLARE
 officer_id uuid;
 requested_member uuid;
 evt vasra.kk_card_review_mail;
 nonce uuid;
 BEGIN_STATE text;
BEGIN
 SELECT u.id INTO officer_id
 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
  AND u.role IN ('chairman','sk') AND u.disabled_at IS NULL
  AND NOT u.must_change LIMIT 1;
 IF officer_id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF action='list' THEN
  RETURN jsonb_build_object('messages',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'member_id',e.member_id,'decision',e.decision,
    'delivery_state',e.delivery_state,'has_pdf',e.pdf_path IS NOT NULL))
   FROM vasra.kk_card_review_mail e
   JOIN vasra.kk_id_cards c ON c.member_id=e.member_id
    AND c.storage_path=e.card_path AND c.status=e.decision
  ),'[]'::jsonb));
 END IF;
 IF coalesce(payload->>'id','') !~
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN jsonb_build_object('error',400); END IF;
 requested_member=(payload->>'id')::uuid;

 IF action='attach' THEN
  IF coalesce(payload->>'path','') !~
   ('^card-pdfs/'||requested_member::text||'/[0-9a-f-]{36}[.]pdf$')
  THEN RETURN jsonb_build_object('error',400); END IF;
  UPDATE vasra.kk_card_review_mail e
   SET pdf_path=payload->>'path'
   FROM vasra.kk_id_cards c
   WHERE e.member_id=requested_member
    AND c.member_id=e.member_id AND e.card_path=c.storage_path
    AND c.status='approved' AND e.decision='approved'
    AND e.delivery_state='pending' AND e.pdf_path IS NULL;
  RETURN jsonb_build_object('ok',FOUND);
 END IF;

 IF action='claim' THEN
  UPDATE vasra.kk_card_review_mail e
  SET delivery_state='sending',claim_nonce=gen_random_uuid(),
   lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1
  FROM vasra.kk_id_cards c
  WHERE e.member_id=requested_member AND c.member_id=e.member_id
    AND c.storage_path=e.card_path AND c.status=e.decision
    AND (e.decision='rejected' OR e.pdf_path IS NOT NULL)
    AND (e.delivery_state='pending' OR
      (e.delivery_state='sending' AND e.lease_until<clock_timestamp()))
    AND e.attempts<5 AND e.created_at>clock_timestamp()-interval '23 hours'
  RETURNING e.* INTO evt;
  IF FOUND THEN
   RETURN jsonb_build_object('status','claimed','event_id',evt.event_id,
    'nonce',evt.claim_nonce,'decision',evt.decision,'email',evt.recipient_email,
    'kk_id',evt.kk_id,'reason',evt.review_note,'pdf_path',evt.pdf_path);
  END IF;
  SELECT delivery_state INTO BEGIN_STATE FROM vasra.kk_card_review_mail e
   JOIN vasra.kk_id_cards c ON c.member_id=e.member_id
     AND c.storage_path=e.card_path AND c.status=e.decision
   WHERE e.member_id=requested_member;
  RETURN jsonb_build_object('status',coalesce(BEGIN_STATE,'not_queued'));
 END IF;

 IF action IN ('accept','release') THEN
  IF coalesce(payload->>'nonce','') !~
   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RETURN jsonb_build_object('error',400); END IF;
  nonce=(payload->>'nonce')::uuid;
  IF action='accept' THEN
   UPDATE vasra.kk_card_review_mail SET delivery_state='accepted',
    accepted_at=clock_timestamp(),lease_until=NULL,claim_nonce=NULL,
    provider_email_id=left(coalesce(payload->>'provider_id',''),128)
   WHERE member_id=requested_member AND claim_nonce=nonce
     AND delivery_state='sending';
  ELSE
   UPDATE vasra.kk_card_review_mail SET delivery_state='pending',
     lease_until=NULL,claim_nonce=NULL
   WHERE member_id=requested_member AND claim_nonce=nonce
     AND delivery_state='sending';
  END IF;
  RETURN jsonb_build_object('ok',FOUND);
 END IF;
 RETURN jsonb_build_object('error',404);
END
$mail$;
REVOKE ALL ON FUNCTION public.vasra_kk_card_mail(text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_card_mail(text,jsonb,text) TO service_role;
