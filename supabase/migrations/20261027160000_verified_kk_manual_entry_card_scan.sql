-- Verified KK membership and SK-approved KK ID cards are independent states.
-- Staff-only read-only preflight. Manual entry works for verified members lacking
-- a 2x2 photo; QR identification needs an uploaded SK-approved card.
-- QR number remains an identifier, not cryptographic proof of the person.
CREATE OR REPLACE FUNCTION public.vasra_kk_scan_identity(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $identity$
DECLARE
 officer_id uuid;
 target_kk_id text;
 entry_mode text;
 membership_status text;
 card_status text;
 card_path text;
 card_reviewed_at timestamptz;
 card_verified boolean;
BEGIN
 SELECT u.id INTO officer_id
 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
   AND u.role IN ('sk','chairman') AND u.disabled_at IS NULL
   AND NOT u.must_change LIMIT 1;
 IF officer_id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF action<>'lookup' THEN RETURN jsonb_build_object('error',404); END IF;
 target_kk_id=upper(btrim(coalesce(payload->>'kk_id','')));
 entry_mode=lower(btrim(coalesce(payload->>'mode','')));
 IF target_kk_id !~ '^VASRA-KK-[0-9]{1,10}$' OR entry_mode NOT IN ('manual','qr')
 THEN RETURN jsonb_build_object('error',400,'reason','invalid_scan_request'); END IF;

 SELECT p.status,c.status,c.storage_path,c.reviewed_at
 INTO membership_status,card_status,card_path,card_reviewed_at
 FROM vasra.kk_profiles p LEFT JOIN vasra.kk_id_cards c ON c.member_id=p.member_id
 WHERE p.kk_id=target_kk_id
 LIMIT 1;
 IF NOT FOUND OR membership_status IS DISTINCT FROM 'verified'
 THEN RETURN jsonb_build_object('error',404,'reason','member_not_verified'); END IF;
 card_verified=(card_status='approved' AND nullif(card_path,'') IS NOT NULL
                AND card_reviewed_at IS NOT NULL);
 IF entry_mode='qr' AND NOT coalesce(card_verified,false)
 THEN RETURN jsonb_build_object('error',409,'reason','card_not_verified',
   'card_status',coalesce(card_status,'not_uploaded'),'card_verified',false); END IF;
 RETURN jsonb_build_object('ok',true,'member_verified',true,
    'card_verified',coalesce(card_verified,false),
    'card_status',coalesce(card_status,'not_uploaded'),
    'entry_mode',entry_mode);
END
$identity$;
REVOKE ALL ON FUNCTION public.vasra_kk_scan_identity(text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_scan_identity(text,jsonb,text) TO service_role;
