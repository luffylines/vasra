-- Previously applied to dedicated VASRA Supabase on 2026-10-25.
-- GitHub history mirror for disaster recovery. Do NOT reapply blindly to populated databases.
CREATE TABLE IF NOT EXISTS vasra.kk_service_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES vasra.kk_members(id) ON DELETE CASCADE,
 service_type text NOT NULL CHECK(service_type IN ('printing','computer','retabox')),
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_at timestamptz,
 reviewer_id uuid REFERENCES vasra.users(id),
 review_note text NOT NULL DEFAULT '',
 verified_grams integer,
 points_awarded integer NOT NULL DEFAULT 0 CHECK(points_awarded>=0)
);
CREATE INDEX IF NOT EXISTS kk_service_requests_member_idx ON vasra.kk_service_requests(member_id,requested_at DESC);
CREATE INDEX IF NOT EXISTS kk_service_requests_status_idx ON vasra.kk_service_requests(status,requested_at DESC);
CREATE TABLE IF NOT EXISTS vasra.kk_service_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
 retabox_points_per_kg integer NOT NULL DEFAULT 0 CHECK(retabox_points_per_kg BETWEEN 0 AND 5000),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by uuid REFERENCES vasra.users(id)
);
INSERT INTO vasra.kk_service_settings(id,retabox_points_per_kg) VALUES(1,0) ON CONFLICT(id) DO NOTHING;
ALTER TABLE vasra.kk_points ADD COLUMN IF NOT EXISTS service_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS kk_points_service_once_idx
 ON vasra.kk_points(service_request_id) WHERE service_request_id IS NOT NULL;
ALTER TABLE vasra.kk_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE vasra.kk_service_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vasra.kk_service_requests,vasra.kk_service_settings FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.vasra_kk_services(action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 youth_id uuid;
 staff_id uuid;
 staff_role text;
 youth_verified boolean;
 item vasra.kk_service_requests;
 settings_rate integer;
 grams integer;
 awarded integer;
 kind text;
 info jsonb;
 note_text text;
 requested_id uuid;
begin
 select s.member_id into youth_id from vasra.kk_sessions s
 where s.token_hash=session_hash and s.expires>clock_timestamp() limit 1;
 select u.id,u.role into staff_id,staff_role from vasra.users u
 join vasra.sessions s on s.user_id=u.id
 where s.token=session_hash and s.expires>clock_timestamp()
 and u.role in ('sk','chairman') and u.disabled_at is null and u.must_change=false limit 1;

 if action='settings' then
  if staff_id is null then return jsonb_build_object('error',403); end if;
  return jsonb_build_object('retabox_points_per_kg',coalesce(
   (select c.retabox_points_per_kg from vasra.kk_service_settings c where c.id=1),0));
 end if;
 if action='configure' then
  if staff_role is distinct from 'chairman' then return jsonb_build_object('error',403); end if;
  if coalesce(payload->>'points_per_kg','') !~ '^[0-9]{1,4}$'
  then return jsonb_build_object('error',400); end if;
  settings_rate=(payload->>'points_per_kg')::integer;
  if settings_rate>5000 then return jsonb_build_object('error',400); end if;
  insert into vasra.kk_service_settings(id,retabox_points_per_kg,updated_at,updated_by)
  values(1,settings_rate,clock_timestamp(),staff_id)
  on conflict(id) do update set retabox_points_per_kg=excluded.retabox_points_per_kg,
  updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  return jsonb_build_object('ok',true,'retabox_points_per_kg',settings_rate);
 end if;
 if action='staff_list' then
  if staff_id is null then return jsonb_build_object('error',403); end if;
  return jsonb_build_object('requests',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',r.id,'member_id',r.member_id,'name',concat_ws(' ',m.first_name,m.last_name),
    'service_type',r.service_type,'details',r.details,'status',r.status,
    'requested_at',r.requested_at,'review_note',r.review_note,
    'verified_grams',r.verified_grams,'points_awarded',r.points_awarded,
    'reviewed_at',r.reviewed_at) order by r.requested_at desc)
   from (select * from vasra.kk_service_requests order by requested_at desc limit 250) r
   join vasra.kk_members m on m.id=r.member_id
  ),'[]'::jsonb),'retabox_points_per_kg',coalesce(
   (select c.retabox_points_per_kg from vasra.kk_service_settings c where c.id=1),0));
 end if;
 if action='mine' then
  if youth_id is null then return jsonb_build_object('error',401); end if;
  return jsonb_build_object('requests',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',r.id,'service_type',r.service_type,'details',r.details,'status',r.status,
    'requested_at',r.requested_at,'review_note',r.review_note,
    'verified_grams',r.verified_grams,'points_awarded',r.points_awarded)
    order by r.requested_at desc)
   from (select * from vasra.kk_service_requests where member_id=youth_id
    order by requested_at desc limit 100) r),'[]'::jsonb));
 end if;
 if action='request' then
  if youth_id is null then return jsonb_build_object('error',401); end if;
  select p.status='verified' into youth_verified from vasra.kk_profiles p where p.member_id=youth_id;
  if youth_verified is distinct from true then return jsonb_build_object('error',403); end if;
  kind=payload->>'service_type';
  info=payload->'details';
  if kind not in ('printing','computer','retabox') or jsonb_typeof(info) is distinct from 'object'
   then return jsonb_build_object('error',400); end if;
  if kind='printing' then
   if coalesce(info->>'paper_size','') not in ('short','long') or
      coalesce(info->>'color','') not in ('bw','colored') or
      coalesce(info->>'copies','') !~ '^[0-9]{1,3}$' or
      coalesce(info->>'pages','') !~ '^[0-9]{1,3}$' or
      (info->>'copies')::integer not between 1 and 100 or
      (info->>'pages')::integer not between 1 and 100
   then return jsonb_build_object('error',400); end if;
   info=jsonb_build_object('paper_size',info->>'paper_size','color',info->>'color',
      'copies',(info->>'copies')::integer,'pages',(info->>'pages')::integer);
  elsif kind='computer' then
   if coalesce(info->>'hours','') !~ '^[0-9]{1,2}$' or
      (info->>'hours')::integer not between 1 and 8
   then return jsonb_build_object('error',400); end if;
   info=jsonb_build_object('hours',(info->>'hours')::integer);
  else
   if coalesce(info->>'grams','') !~ '^[0-9]{1,6}$' or
      (info->>'grams')::integer not between 1 and 100000 or
      length(btrim(coalesce(info->>'description','')))>180
   then return jsonb_build_object('error',400); end if;
   info=jsonb_build_object('grams',(info->>'grams')::integer,
    'description',left(btrim(coalesce(info->>'description','')),180));
  end if;
  insert into vasra.kk_service_requests(member_id,service_type,details)
   values(youth_id,kind,info) returning id into requested_id;
  return jsonb_build_object('ok',true,'id',requested_id,'status','pending');
 end if;
 if action='review' then
  if staff_id is null then return jsonb_build_object('error',403); end if;
  if coalesce(payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    coalesce(payload->>'status','') not in ('approved','rejected')
   then return jsonb_build_object('error',400); end if;
  select * into item from vasra.kk_service_requests where id=(payload->>'id')::uuid for update;
  if not found then return jsonb_build_object('error',404); end if;
  if item.status<>'pending' then return jsonb_build_object('error',409); end if;
  note_text=left(btrim(coalesce(payload->>'note','')),500);
  awarded=0;
  grams=null;
  if item.service_type='retabox' and payload->>'status'='approved' then
   if coalesce(payload->>'verified_grams','') !~ '^[0-9]{1,6}$'
    then return jsonb_build_object('error',400); end if;
   grams=(payload->>'verified_grams')::integer;
   if grams not between 1 and 100000 then return jsonb_build_object('error',400); end if;
   select c.retabox_points_per_kg into settings_rate from vasra.kk_service_settings c where c.id=1;
   if coalesce(settings_rate,0)=0 then return jsonb_build_object('error',409,'reason','points_rate_not_configured'); end if;
   awarded=floor(grams::numeric*settings_rate/1000)::integer;
  end if;
  if payload->>'status'='rejected' and length(note_text)<5
   then return jsonb_build_object('error',400); end if;
  update vasra.kk_service_requests set status=payload->>'status',
   review_note=note_text,reviewed_at=clock_timestamp(),reviewer_id=staff_id,
   verified_grams=grams,points_awarded=awarded where id=item.id;
  if awarded>0 then
   insert into vasra.kk_points(member_id,delta,reason,staff_id,service_request_id)
   values(item.member_id,awarded,'RetaBox donation: '||grams::text||' grams',staff_id,item.id);
  end if;
  return jsonb_build_object('ok',true,'status',payload->>'status','points_awarded',awarded);
 end if;
 return jsonb_build_object('error',404);
end;
$function$
;
