-- SK VASRA · queue exactly one approval-only member email per reviewed reward request.
-- Apply after 20261027073000 reward archival migration. No backfill: do NOT email old approvals.
-- No changes to point deductions, pending reservations, rejected records or reward inventory.
CREATE TABLE IF NOT EXISTS vasra.kk_reward_approval_mail (
 redemption_id uuid PRIMARY KEY REFERENCES vasra.kk_redemptions(id) ON DELETE CASCADE,
 recipient_email text NOT NULL,
 reward_title text NOT NULL,
 points_cost integer NOT NULL,
 delivery_state text NOT NULL DEFAULT 'pending'
   CHECK (delivery_state IN ('pending','sending','accepted')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
 send_nonce uuid,
 lease_until timestamptz,
 last_error_code text,
 accepted_at timestamptz,
 provider_email_id text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE vasra.kk_reward_approval_mail ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vasra.kk_reward_approval_mail FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON vasra.kk_reward_approval_mail TO service_role;

CREATE OR REPLACE FUNCTION vasra.kk_queue_reward_approval_mail()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $enqueue$
BEGIN
 IF OLD.status='pending' AND NEW.status='approved' THEN
  INSERT INTO vasra.kk_reward_approval_mail(redemption_id,recipient_email,reward_title,points_cost)
  SELECT NEW.id,coalesce(m.email,''),p.title,NEW.cost
   FROM vasra.kk_members m JOIN vasra.kk_perks p ON p.id=NEW.perk_id
   WHERE m.id=NEW.member_id
  ON CONFLICT(redemption_id) DO NOTHING;
 END IF;
 RETURN NEW;
END
$enqueue$;
DROP TRIGGER IF EXISTS kk_reward_approval_mail_after_review ON vasra.kk_redemptions;
CREATE TRIGGER kk_reward_approval_mail_after_review
 AFTER UPDATE OF status ON vasra.kk_redemptions
 FOR EACH ROW EXECUTE FUNCTION vasra.kk_queue_reward_approval_mail();

CREATE OR REPLACE FUNCTION public.vasra_kk_reward_email(
 action text,payload jsonb DEFAULT '{}'::jsonb,session_hash text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $mail$
DECLARE
 officer_id uuid;
 target_id uuid;
 nonce uuid;
 picked vasra.kk_reward_approval_mail;
 previous_state text;
BEGIN
 SELECT u.id INTO officer_id
 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
  AND u.role IN ('sk','chairman') AND u.disabled_at IS NULL
  AND NOT u.must_change LIMIT 1;
 IF officer_id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF action='list' THEN
  RETURN jsonb_build_object('notifications',coalesce((
   SELECT jsonb_agg(jsonb_build_object('id',n.redemption_id,'status',n.delivery_state,
    'accepted_at',n.accepted_at,'attempts',n.attempts))
   FROM vasra.kk_reward_approval_mail n
   JOIN vasra.kk_redemptions d ON d.id=n.redemption_id
   WHERE d.status='approved'
  ),'[]'::jsonb));
 END IF;
 IF coalesce(payload->>'id','') !~
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN jsonb_build_object('error',400); END IF;
 target_id=(payload->>'id')::uuid;
 IF action='claim' THEN
  -- Row update is atomic across Vercel instances; one 60-second lease at a time.
  -- Provider idempotency protects retries inside its 24-hour window.
  UPDATE vasra.kk_reward_approval_mail n
   SET delivery_state='sending',send_nonce=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '60 seconds',
    attempts=n.attempts+1,last_error_code=NULL
  WHERE n.redemption_id=target_id
   AND EXISTS(SELECT 1 FROM vasra.kk_redemptions d
     WHERE d.id=n.redemption_id AND d.status='approved')
   AND (n.delivery_state='pending' OR
       (n.delivery_state='sending' AND n.lease_until<clock_timestamp()))
   AND n.attempts<5
   AND n.created_at>clock_timestamp()-interval '23 hours'
  RETURNING n.* INTO picked;
  IF FOUND THEN RETURN jsonb_build_object(
    'status','claimed','id',picked.redemption_id,
    'nonce',picked.send_nonce,
    'recipient',picked.recipient_email,'reward_title',picked.reward_title,
    'points_cost',picked.points_cost);
  END IF;
  SELECT n.delivery_state INTO previous_state
   FROM vasra.kk_reward_approval_mail n WHERE n.redemption_id=target_id;
  RETURN jsonb_build_object('status',coalesce(previous_state,'not_queued'));
 END IF;
 IF action IN ('accept','release') THEN
  IF coalesce(payload->>'nonce','') !~
   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RETURN jsonb_build_object('error',400); END IF;
  nonce=(payload->>'nonce')::uuid;
  IF action='accept' THEN
   UPDATE vasra.kk_reward_approval_mail
     SET delivery_state='accepted',accepted_at=clock_timestamp(),
         provider_email_id=left(coalesce(payload->>'provider_id',''),128),
         lease_until=NULL,send_nonce=NULL,last_error_code=NULL
   WHERE redemption_id=target_id AND delivery_state='sending' AND send_nonce=nonce;
  ELSE
   UPDATE vasra.kk_reward_approval_mail
     SET delivery_state='pending',lease_until=NULL,send_nonce=NULL,
       last_error_code='provider_not_accepted'
   WHERE redemption_id=target_id AND delivery_state='sending' AND send_nonce=nonce;
  END IF;
  RETURN jsonb_build_object('ok',FOUND);
 END IF;
 RETURN jsonb_build_object('error',404);
END
$mail$;
REVOKE ALL ON FUNCTION public.vasra_kk_reward_email(text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_reward_email(text,jsonb,text) TO service_role;
