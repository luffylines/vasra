-- STAGED / REVIEW REQUIRED: KK Profiling stores sensitive resident information.
-- Never apply without SK authorization and a verified privacy notice.
begin;
create table if not exists vasra.kk_members (
 id uuid primary key default gen_random_uuid(),
 first_name text not null default '',
 middle_name text not null default '',
 last_name text not null default '',
 birthdate date,
 phone text not null default '',
 email text not null unique,
 password_hash text,
 google_sub text unique,
 email_verified boolean not null default false,
 referral_code text not null default '',
 created_at timestamptz not null default now(),
 constraint kk_auth_method check(password_hash is not null or google_sub is not null)
);
create table if not exists vasra.kk_sessions (
 token_hash text primary key,
 member_id uuid not null references vasra.kk_members(id) on delete cascade,
 expires timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists kk_session_member_idx on vasra.kk_sessions(member_id);
-- SK-controlled Sitio/Purok directory; start empty instead of inventing sitios.
create table if not exists vasra.kk_sitios (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 normalized_name text generated always as (lower(btrim(name))) stored unique,
 active boolean not null default true,
 sort_order integer not null default 100,
 created_by uuid not null references vasra.users(id),
 created_at timestamptz not null default now(),
 constraint kk_sitio_name_check check (length(btrim(name)) between 2 and 100)
);
create table if not exists vasra.kk_profiles (
 member_id uuid primary key references vasra.kk_members(id) on delete cascade,
 profile jsonb not null default '{}'::jsonb,
 step smallint not null default 1 check(step between 1 and 5),
 status text not null default 'draft' check(status in ('draft','pending','verified','rejected')),
 reviewer_id uuid references vasra.users(id),
 review_note text not null default '',
 reviewed_at timestamptz,
 submitted_at timestamptz,
 kk_id text unique,
 updated_at timestamptz not null default now()
);
create index if not exists kk_profiles_status_idx on vasra.kk_profiles(status,updated_at desc);
create table if not exists vasra.kk_points (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references vasra.kk_members(id) on delete cascade,
 delta integer not null check(delta between -10000 and 500),
 reason text not null,
 staff_id uuid not null references vasra.users(id),
 redemption_id uuid unique,
 created_at timestamptz not null default now()
);
create index if not exists kk_points_member_idx on vasra.kk_points(member_id);
create table if not exists vasra.kk_perks (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 description text not null default '',
 cost integer not null check(cost between 1 and 10000),
 active boolean not null default true,
 updated_by uuid not null references vasra.users(id),
 created_at timestamptz not null default now()
);
create table if not exists vasra.kk_redemptions (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references vasra.kk_members(id) on delete cascade,
 perk_id uuid not null references vasra.kk_perks(id),
 cost integer not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 note text not null default '',
 reviewed_by uuid references vasra.users(id),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create index if not exists kk_redemptions_status_idx on vasra.kk_redemptions(status,created_at desc);

-- Defense in depth: residents' sensitive information must never be exposed via
-- implicit REST grants or an accidentally widened schema exposure.
-- The internal service_role RPC gateway bypasses RLS only after server-side auth.
alter table vasra.kk_members enable row level security;
alter table vasra.kk_sessions enable row level security;
alter table vasra.kk_profiles enable row level security;
alter table vasra.kk_sitios enable row level security;
alter table vasra.kk_points enable row level security;
alter table vasra.kk_perks enable row level security;
alter table vasra.kk_redemptions enable row level security;
revoke all on vasra.kk_members,vasra.kk_sessions,vasra.kk_profiles,vasra.kk_points,vasra.kk_perks,vasra.kk_redemptions,vasra.kk_sitios from public, anon, authenticated;
grant select,insert,update,delete on vasra.kk_members,vasra.kk_sessions,vasra.kk_profiles,vasra.kk_points,vasra.kk_perks,vasra.kk_redemptions,vasra.kk_sitios to service_role;

create or replace function public.vasra_kk(action text,payload jsonb default '{}'::jsonb,session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 m vasra.kk_members;
 pr vasra.kk_profiles;
 staff vasra.users;
 p vasra.kk_perks;
 redemption vasra.kk_redemptions;
 target_member uuid;
 record_id uuid;
 points_balance integer;
 given_profile jsonb;
 selected_sitio uuid;
 current_date_ph date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
 if action='sitios' then
  return jsonb_build_object('sitios',coalesce((
    select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.sort_order,s.name)
    from vasra.kk_sitios s where s.active
  ),'[]'::jsonb));
 end if;
 if action='lookup' then
  return coalesce((select jsonb_build_object('id',m.id,'password_hash',m.password_hash)
   from vasra.kk_members m where m.email=lower(btrim(payload->>'email'))),
   'null'::jsonb);
 end if;
 if action='register' then
  if length(btrim(coalesce(payload->>'first_name',''))) not between 2 and 80 or
     length(btrim(coalesce(payload->>'last_name',''))) not between 2 and 80 or
     length(btrim(coalesce(payload->>'middle_name',''))) > 80 or
     length(btrim(coalesce(payload->>'phone',''))) not between 10 and 22 or
     length(btrim(coalesce(payload->>'email',''))) > 160 or
     payload->>'email' !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' or
     nullif(payload->>'password_hash','') is null or
     (payload->>'birthdate')::date > current_date_ph - interval '15 years' or
     (payload->>'birthdate')::date <= current_date_ph - interval '31 years'
  then return jsonb_build_object('error',400); end if;
  insert into vasra.kk_members(first_name,middle_name,last_name,birthdate,phone,email,password_hash,referral_code)
   values(btrim(payload->>'first_name'),btrim(coalesce(payload->>'middle_name','')),
    btrim(payload->>'last_name'),(payload->>'birthdate')::date,btrim(payload->>'phone'),
    lower(btrim(payload->>'email')),payload->>'password_hash',
    left(btrim(coalesce(payload->>'referral_code','')),40))
   on conflict(email) do nothing returning * into m;
  if m.id is null then return jsonb_build_object('error',409); end if;
  insert into vasra.kk_profiles(member_id) values(m.id);
  insert into vasra.kk_sessions(token_hash,member_id,expires) values(payload->>'token_hash',m.id,clock_timestamp()+interval '7 days');
  return jsonb_build_object('ok',true);
 end if;
 if action='login' then
  select * into m from vasra.kk_members where id=(payload->>'id')::uuid for update;
  if not found or m.password_hash is null or m.password_hash<>payload->>'password_hash'
  then return jsonb_build_object('error',401); end if;
  insert into vasra.kk_sessions(token_hash,member_id,expires)
  values(payload->>'token_hash',m.id,clock_timestamp()+interval '7 days');
  return jsonb_build_object('ok',true);
 end if;
 if action='google' then
  if coalesce(payload->>'sub','') !~ '^[0-9]{5,40}$' or
   coalesce(payload->>'email','') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$'
  then return jsonb_build_object('error',400); end if;
  select * into m from vasra.kk_members where email=lower(payload->>'email') for update;
  if found and m.google_sub is distinct from payload->>'sub' then
   -- Avoid silently linking Google credentials to an unverified password account.
   return jsonb_build_object('error',409,'reason','account_link_required');
  end if;
  if not found then
   insert into vasra.kk_members(email,google_sub,email_verified) values(lower(payload->>'email'),payload->>'sub',true)
    returning * into m;
   insert into vasra.kk_profiles(member_id) values(m.id);
  end if;
  insert into vasra.kk_sessions(token_hash,member_id,expires)
   values(payload->>'token_hash',m.id,clock_timestamp()+interval '7 days');
  return jsonb_build_object('ok',true);
 end if;
 if action='logout' then
  delete from vasra.kk_sessions where token_hash=session_hash;
  return jsonb_build_object('ok',true);
 end if;
 select u.* into staff from vasra.users u
  join vasra.sessions s on s.user_id=u.id
  where s.token=session_hash and s.expires>clock_timestamp() and u.role in ('sk','chairman')
  and not u.must_change limit 1;
 if action in ('staff_list','staff_review','staff_award','perk_save','perk_review','staff_export','sitio_manage','sitio_list','staff_catalog') then
  if staff.id is null then return jsonb_build_object('error',403); end if;
  if action='staff_catalog' then
   return jsonb_build_object('perks',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,
    'description',p.description,'cost',p.cost,'active',p.active) order by p.created_at desc)
    from vasra.kk_perks p),'[]'::jsonb));
  end if;
  if action='sitio_list' then
   return jsonb_build_object('sitios',coalesce((select jsonb_agg(jsonb_build_object(
     'id',s.id,'name',s.name,'active',s.active,'sort_order',s.sort_order)
      order by s.sort_order,s.name) from vasra.kk_sitios s),'[]'::jsonb));
  end if;
  if action='sitio_manage' then
   -- SK staff may manage the Barangay Vasra Sitio directory; all changes are audited.
   if payload->>'intent'='save' then
    if length(btrim(coalesce(payload->>'name',''))) not between 2 and 100 or
      btrim(coalesce(payload->>'name','')) ~ '[[:cntrl:]<>]' or
      coalesce((payload->>'sort_order')::integer,100) not between 0 and 10000
    then return jsonb_build_object('error',400); end if;
    record_id=nullif(payload->>'id','')::uuid;
    if record_id is null then
     if exists(select 1 from vasra.kk_sitios where normalized_name=lower(btrim(payload->>'name')))
       then return jsonb_build_object('error',409); end if;
     insert into vasra.kk_sitios(name,sort_order,active,created_by)
      values(btrim(payload->>'name'),coalesce((payload->>'sort_order')::integer,100),
       coalesce((payload->>'active')::boolean,true),staff.id);
    else
     update vasra.kk_sitios set name=btrim(payload->>'name'),
      sort_order=coalesce((payload->>'sort_order')::integer,100),
      active=coalesce((payload->>'active')::boolean,true)
      where id=record_id;
     if not found then return jsonb_build_object('error',404); end if;
    end if;
    insert into vasra.audit(actor_id,actor_name,action,entity,details) values
      (staff.id,staff.name,'kk_sitio_saved',coalesce(record_id::text,'new'),jsonb_build_object('name',payload->>'name'));
    return jsonb_build_object('ok',true);
   end if;
   if payload->>'intent'='disable' then
    record_id=(payload->>'id')::uuid;
    update vasra.kk_sitios set active=false where id=record_id;
    if not found then return jsonb_build_object('error',404); end if;
    insert into vasra.audit(actor_id,actor_name,action,entity,details) values
      (staff.id,staff.name,'kk_sitio_disabled',record_id::text,'{}'::jsonb);
    return jsonb_build_object('ok',true);
   end if;
   return jsonb_build_object('error',400);
  end if;
  if action in ('staff_list','staff_export') then
   return jsonb_build_object('members',coalesce((
    select jsonb_agg(jsonb_build_object('id',u.id,'kk_id',r.kk_id,
     'first_name',u.first_name,'middle_name',u.middle_name,'last_name',u.last_name,
     'birthdate',u.birthdate,'phone',u.phone,'email',u.email,'email_verified',u.email_verified,
     'profile',r.profile,'status',r.status,'step',r.step,'review_note',r.review_note,
     'submitted_at',r.submitted_at,'updated_at',r.updated_at,
     'points',coalesce((select sum(q.delta) from vasra.kk_points q where q.member_id=u.id),0)
    ) order by r.updated_at desc)
    from vasra.kk_members u join vasra.kk_profiles r on r.member_id=u.id
    where action='staff_list' or r.status='verified'
   ),'[]'::jsonb),
   'redemptions',case when action='staff_list' then
    coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',concat_ws(' ',u.first_name,u.last_name),
     'perk',p.title,'cost',d.cost,'status',d.status,'note',d.note) order by d.created_at desc)
     from vasra.kk_redemptions d join vasra.kk_members u on u.id=d.member_id
     join vasra.kk_perks p on p.id=d.perk_id),'[]'::jsonb)
    else '[]'::jsonb end);
  end if;
  if action='staff_review' then
   select * into pr from vasra.kk_profiles where member_id=(payload->>'id')::uuid for update;
   if not found or pr.status<>'pending' or payload->>'status' not in ('verified','rejected')
   then return jsonb_build_object('error',409); end if;
   if payload->>'status'='rejected' and length(btrim(coalesce(payload->>'note','')))<5
   then return jsonb_build_object('error',400); end if;
   update vasra.kk_profiles set status=payload->>'status',reviewer_id=staff.id,
     review_note=left(btrim(coalesce(payload->>'note','')),500),reviewed_at=clock_timestamp(),
     kk_id=case when payload->>'status'='verified'
      then coalesce(kk_id,'VASRA-KK-'||upper(left(replace(member_id::text,'-',''),12))) else kk_id end,
     updated_at=clock_timestamp() where member_id=pr.member_id;
   insert into vasra.audit(actor_id,actor_name,action,entity,details)
    values(staff.id,staff.name,'kk_profile_reviewed',pr.member_id::text,jsonb_build_object('status',payload->>'status'));
   return jsonb_build_object('ok',true);
  end if;
  if action='staff_award' then
   target_member=(payload->>'id')::uuid;
   select * into pr from vasra.kk_profiles where member_id=target_member for update;
   if not found or pr.status<>'verified' or coalesce((payload->>'points')::integer,0) not between 1 and 500
    or length(btrim(coalesce(payload->>'reason',''))) not between 5 and 200
   then return jsonb_build_object('error',400); end if;
   insert into vasra.kk_points(member_id,delta,reason,staff_id)
    values(target_member,(payload->>'points')::integer,btrim(payload->>'reason'),staff.id);
   insert into vasra.audit(actor_id,actor_name,action,entity,details)
    values(staff.id,staff.name,'kk_points_awarded',target_member::text,jsonb_build_object('points',payload->>'points'));
   return jsonb_build_object('ok',true);
  end if;
  if action='perk_save' then
   if staff.role<>'chairman' or length(btrim(coalesce(payload->>'title',''))) not between 3 and 120
    or coalesce((payload->>'cost')::integer,0) not between 1 and 10000
    or length(coalesce(payload->>'description',''))>500 then return jsonb_build_object('error',403); end if;
   record_id=nullif(payload->>'id','')::uuid;
   if record_id is null then
    insert into vasra.kk_perks(title,description,cost,active,updated_by)
     values(btrim(payload->>'title'),btrim(coalesce(payload->>'description','')),
      (payload->>'cost')::integer,coalesce((payload->>'active')::boolean,true),staff.id);
   else
    update vasra.kk_perks set title=btrim(payload->>'title'),description=btrim(coalesce(payload->>'description','')),
     cost=(payload->>'cost')::integer,active=coalesce((payload->>'active')::boolean,true),
     updated_by=staff.id where id=record_id;
    if not found then return jsonb_build_object('error',404); end if;
   end if;
   return jsonb_build_object('ok',true);
  end if;
  if action='perk_review' then
   select * into redemption from vasra.kk_redemptions
     where id=(payload->>'id')::uuid for update;
   if not found or redemption.status<>'pending'
     or payload->>'status' not in ('approved','rejected') then return jsonb_build_object('error',409); end if;
   select * into m from vasra.kk_members where id=redemption.member_id for update;
   select coalesce(sum(delta),0) into points_balance from vasra.kk_points where member_id=m.id;
   if payload->>'status'='approved' and points_balance<redemption.cost then return jsonb_build_object('error',409); end if;
   update vasra.kk_redemptions set status=payload->>'status',
    note=left(btrim(coalesce(payload->>'note','')),500),reviewed_by=staff.id,
    reviewed_at=clock_timestamp() where id=redemption.id;
   if payload->>'status'='approved' then
    insert into vasra.kk_points(member_id,delta,reason,staff_id,redemption_id)
    values(m.id,-redemption.cost,'Perk redemption',staff.id,redemption.id);
   end if;
   return jsonb_build_object('ok',true);
  end if;
 end if;
 select u.* into m from vasra.kk_members u join vasra.kk_sessions s on s.member_id=u.id
  where s.token_hash=session_hash and s.expires>clock_timestamp() limit 1;
 if m.id is null then return jsonb_build_object('error',401); end if;
 select * into pr from vasra.kk_profiles where member_id=m.id;
 if action='mine' then
  return jsonb_build_object('member',jsonb_build_object('id',m.id,'first_name',m.first_name,
    'middle_name',m.middle_name,'last_name',m.last_name,'birthdate',m.birthdate,
    'phone',m.phone,'email',m.email,'email_verified',m.email_verified),
   'profile',jsonb_build_object('data',pr.profile,'step',pr.step,'status',pr.status,
    'kk_id',pr.kk_id,'review_note',pr.review_note),
   'points',coalesce((select sum(delta) from vasra.kk_points where member_id=m.id),0),
   'perks',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'description',p.description,
    'cost',p.cost) order by p.cost) from vasra.kk_perks p where p.active),'[]'::jsonb),
   'redemptions',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'perk',p.title,
    'cost',d.cost,'status',d.status) order by d.created_at desc)
    from vasra.kk_redemptions d join vasra.kk_perks p on p.id=d.perk_id
    where d.member_id=m.id),'[]'::jsonb));
 end if;
 if action='profile_save' then
  select * into pr from vasra.kk_profiles where member_id=m.id for update;
  if not found then return jsonb_build_object('error',404); end if;
  if pr.status in ('pending','verified') then return jsonb_build_object('error',409); end if;
  given_profile=payload->'profile';
  if jsonb_typeof(given_profile)<>'object' or length(given_profile::text)>12000 or
     coalesce((payload->>'step')::integer,0) not between 1 and 5
  then return jsonb_build_object('error',400); end if;
  if coalesce(given_profile->>'sitio_id','')<>'' and
     not exists(select 1 from vasra.kk_sitios
      where id::text=given_profile->>'sitio_id' and active)
  then return jsonb_build_object('error',400); end if;
  if coalesce(given_profile->>'region','')<>'NCR' or
     coalesce(given_profile->>'province','')<>'N/A (NCR)' or
     coalesce(given_profile->>'city','')<>'Quezon City' or
     coalesce(given_profile->>'barangay','')<>'Vasra'
  then return jsonb_build_object('error',400); end if;
  -- Google-first youth complete their identity before saving their profile.
  if m.first_name='' then
   if length(btrim(coalesce(payload->>'first_name',''))) not between 2 and 80 or
      length(btrim(coalesce(payload->>'last_name',''))) not between 2 and 80 or
      coalesce(payload->>'birthdate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or
      coalesce(payload->>'phone','') !~ '^([+]63|0)9[0-9]{9}$'
   then return jsonb_build_object('error',400); end if;
   if (payload->>'birthdate')::date > current_date_ph - interval '15 years' or
      (payload->>'birthdate')::date <= current_date_ph - interval '31 years'
   then return jsonb_build_object('error',400); end if;
   update vasra.kk_members set first_name=btrim(payload->>'first_name'),
     last_name=btrim(payload->>'last_name'),
     middle_name=left(btrim(coalesce(payload->>'middle_name','')),80),
     phone=btrim(payload->>'phone'),birthdate=(payload->>'birthdate')::date
     where id=m.id;
  end if;
  update vasra.kk_profiles set profile=given_profile,step=(payload->>'step')::smallint,
   status='draft',review_note='',reviewer_id=null,reviewed_at=null,updated_at=clock_timestamp()
   where member_id=m.id;
  return jsonb_build_object('ok',true);
 end if;
 if action='submit' then
  select * into pr from vasra.kk_profiles where member_id=m.id for update;
  select * into m from vasra.kk_members where id=m.id;
  if pr.status in ('pending','verified') then return jsonb_build_object('error',409); end if;
  if m.first_name='' or m.last_name='' or m.birthdate is null or
     m.birthdate > current_date_ph - interval '15 years' or
     m.birthdate <= current_date_ph - interval '31 years' or length(m.phone)<10 or
     coalesce(pr.profile->>'region','')<>'NCR' or
     coalesce(pr.profile->>'province','')<>'N/A (NCR)' or
     coalesce(pr.profile->>'city','')<>'Quezon City' or
     coalesce(pr.profile->>'barangay','')<>'Vasra' or
     not exists(select 1 from vasra.kk_sitios s
       where s.id::text=coalesce(pr.profile->>'sitio_id','') and s.active) or
     not (
        (coalesce(pr.profile->>'education','')='no-formal' and coalesce(pr.profile->>'year_level','') in ('na'))
   or (coalesce(pr.profile->>'education','')='elementary' and coalesce(pr.profile->>'year_level','') in ('grade-1','grade-2','grade-3','grade-4','grade-5','grade-6','completed'))
   or (coalesce(pr.profile->>'education','')='junior-high' and coalesce(pr.profile->>'year_level','') in ('grade-7','grade-8','grade-9','grade-10','completed'))
   or (coalesce(pr.profile->>'education','')='senior-high' and coalesce(pr.profile->>'year_level','') in ('grade-11','grade-12','completed'))
   or (coalesce(pr.profile->>'education','')='als' and coalesce(pr.profile->>'year_level','') in ('elementary','junior-high','senior-high','completed'))
   or (coalesce(pr.profile->>'education','')='vocational' and coalesce(pr.profile->>'year_level','') in ('level-1','level-2','level-3','completed'))
   or (coalesce(pr.profile->>'education','')='college' and coalesce(pr.profile->>'year_level','') in ('year-1','year-2','year-3','year-4','year-5','year-6','completed'))
   or (coalesce(pr.profile->>'education','')='graduate' and coalesce(pr.profile->>'year_level','') in ('master-1','master-2','doctorate-1','doctorate-2','doctorate-3','completed'))
   or (coalesce(pr.profile->>'education','')='out-of-school' and coalesce(pr.profile->>'year_level','') in ('na'))
     ) or
     length(btrim(coalesce(pr.profile->>'emergency_name','')))<3 or
     length(btrim(coalesce(pr.profile->>'emergency_phone','')))<10 or
     coalesce((pr.profile->>'consent')::boolean,false) is not true or
     (age(current_date_ph,m.birthdate) < interval '18 years' and
      coalesce((pr.profile->>'guardian_consent')::boolean,false) is not true)
  then return jsonb_build_object('error',400); end if;
  update vasra.kk_profiles set status='pending',step=5,submitted_at=clock_timestamp(),
   review_note='',updated_at=clock_timestamp() where member_id=m.id;
  return jsonb_build_object('ok',true,'status','pending');
 end if;
 if action='redeem' then
  select * into pr from vasra.kk_profiles where member_id=m.id;
  if pr.status<>'verified' then return jsonb_build_object('error',403); end if;
  select * into m from vasra.kk_members where id=m.id for update;
  select * into p from vasra.kk_perks where id=(payload->>'id')::uuid and active;
  select coalesce(sum(delta),0) into points_balance from vasra.kk_points where member_id=m.id;
  if p.id is null or points_balance<p.cost then return jsonb_build_object('error',409); end if;
  if exists(select 1 from vasra.kk_redemptions where member_id=m.id and perk_id=p.id and status='pending')
  then return jsonb_build_object('error',409); end if;
  insert into vasra.kk_redemptions(member_id,perk_id,cost) values(m.id,p.id,p.cost);
  return jsonb_build_object('ok',true,'status','pending');
 end if;
 return jsonb_build_object('error',404);
end $$;

revoke all on function public.vasra_kk(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_kk(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
