-- SK VASRA: one-step officer approval and private duty notifications for member requests.
-- The SQL function is invoked by the server with the member's opaque KK session hash.
ALTER TABLE vasra.kk_service_requests
  ADD COLUMN IF NOT EXISTS duty_email_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS duty_email_nonce uuid,
  ADD COLUMN IF NOT EXISTS duty_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS duty_email_provider_id text;

CREATE OR REPLACE FUNCTION vasra.kk_service_approval_completes()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $fn$
BEGIN
  IF OLD.status='pending' AND NEW.status='approved' AND NEW.reviewer_id IS NOT NULL THEN
    NEW.status='completed';
    NEW.completed_at=coalesce(NEW.reviewed_at,clock_timestamp());
    NEW.completed_by=NEW.reviewer_id;
    NEW.completed_note=coalesce(NEW.completed_note,'');
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS kk_service_auto_complete_approval ON vasra.kk_service_requests;
CREATE TRIGGER kk_service_auto_complete_approval
  BEFORE UPDATE OF status ON vasra.kk_service_requests
  FOR EACH ROW EXECUTE FUNCTION vasra.kk_service_approval_completes();

-- Historic approved rows (if any) inherit the recorded reviewer, never a guessed officer.
UPDATE vasra.kk_service_requests
  SET status='completed',
      completed_at=coalesce(completed_at,reviewed_at,clock_timestamp()),
      completed_by=reviewer_id
  WHERE status='approved' AND reviewer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.vasra_kk_service_duty_mail(
  action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $fn$
DECLARE
  member uuid;
  r vasra.kk_service_requests%ROWTYPE;
  request_id text:=coalesce(payload->>'id','');
  token_text text:=coalesce(payload->>'nonce','');
  emails jsonb;
  claim_token uuid;
  pht_day integer:=extract(isodow from (clock_timestamp() at time zone 'Asia/Manila'));
BEGIN
  -- Only a live, authenticated member session owning this online request may claim mail.
  SELECT s.member_id INTO member FROM vasra.kk_sessions s
    WHERE s.token_hash=session_hash AND s.expires>clock_timestamp() LIMIT 1;
  IF member IS NULL THEN RETURN jsonb_build_object('error',401); END IF;
  IF request_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN RETURN jsonb_build_object('error',400); END IF;
  SELECT q.* INTO r FROM vasra.kk_service_requests q
    WHERE q.id=request_id::uuid AND q.member_id=member AND q.staff_entry_key IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;

  IF action='claim' THEN
    IF r.duty_email_sent_at IS NOT NULL THEN
      RETURN jsonb_build_object('status','sent'); END IF;
    IF r.duty_email_claimed_at>clock_timestamp()-interval '2 minutes' THEN
      RETURN jsonb_build_object('status','processing'); END IF;
    IF r.status<>'pending' THEN
      RETURN jsonb_build_object('status','not_pending'); END IF;

    -- Published, active official duty roster, Manila local weekday (Monday=1).
    -- Resolve real staff email from linked account, or matching officer name if unlinked.
    SELECT coalesce(jsonb_agg(distinct u.email),'[]'::jsonb) INTO emails
      FROM vasra.officials o JOIN vasra.users u
        ON (u.id=o.account_user_id OR
            (o.account_user_id IS NULL AND lower(btrim(u.name))=lower(btrim(o.name))))
      WHERE o.published IS TRUE AND o.archived IS FALSE
        AND pht_day=ANY(o.duty_days)
        AND u.disabled_at IS NULL AND u.must_change IS FALSE
        AND u.role IN ('chairman','sk') AND nullif(btrim(u.email),'') IS NOT NULL;
    IF jsonb_array_length(emails)=0 THEN
      RETURN jsonb_build_object('status','no_duty_email'); END IF;
    claim_token:=gen_random_uuid();
    UPDATE vasra.kk_service_requests
      SET duty_email_claimed_at=clock_timestamp(),duty_email_nonce=claim_token
      WHERE id=r.id;
    RETURN jsonb_build_object('status','claimed','nonce',claim_token,
      'recipients',emails,'id',r.id,'service_type',r.service_type);
  END IF;

  IF action NOT IN ('accept','release') OR
     token_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN RETURN jsonb_build_object('error',400); END IF;
  IF r.duty_email_sent_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','sent'); END IF;
  IF r.duty_email_nonce IS DISTINCT FROM token_text::uuid OR
     r.duty_email_claimed_at IS NULL THEN
    RETURN jsonb_build_object('error',409); END IF;

  IF action='accept' THEN
    UPDATE vasra.kk_service_requests
      SET duty_email_sent_at=clock_timestamp(),
          duty_email_provider_id=left(coalesce(payload->>'provider_id',''),128),
          duty_email_claimed_at=NULL,duty_email_nonce=NULL
      WHERE id=r.id;
    RETURN jsonb_build_object('ok',true,'status','sent');
  END IF;
  UPDATE vasra.kk_service_requests SET duty_email_claimed_at=NULL,duty_email_nonce=NULL
    WHERE id=r.id;
  RETURN jsonb_build_object('ok',true,'status','released');
END;
$fn$;

-- The Data API function is inaccessible with anon/authenticated credentials.
REVOKE ALL ON FUNCTION public.vasra_kk_service_duty_mail(text,jsonb,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_service_duty_mail(text,jsonb,text) TO service_role;
