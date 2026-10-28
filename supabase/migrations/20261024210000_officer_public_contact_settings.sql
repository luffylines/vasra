-- STAGED ONLY: apply after review; never deploy directly to production.
-- Staff-owned, opt-in public contact details shown only beside their duty assignment.
-- No contact data is copied into the public official directory or auth table.
begin;

create table if not exists vasra.officer_contact_details (
  user_id uuid primary key references vasra.users(id) on delete cascade,
  public_address text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  facebook_url text not null default '',
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint officer_public_address_len check (length(public_address) <= 200),
  constraint officer_public_email_len check (length(contact_email) <= 160),
  constraint officer_public_phone_len check (length(contact_phone) <= 35),
  constraint officer_public_facebook_len check (length(facebook_url) <= 450)
);
-- Defense in depth: only the server-side secret key may use the private schema.
revoke all on table vasra.officer_contact_details from public, anon, authenticated;
grant select, insert, update on table vasra.officer_contact_details to service_role;

create or replace function public.vasra_officer_contacts(
  action text, payload jsonb default '{}'::jsonb, session_hash text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 actor vasra.users;
 v_address text;
 v_email text;
 v_phone text;
 v_facebook text;
 v_public boolean;
begin
 if action = 'public' then
  -- Explicit whitelist: never return account login email, user ID or draft values.
  -- Duplicate staff names are omitted rather than potentially misattributed.
  return jsonb_build_object('contacts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', u.name,
      'position', case when u.role = 'chairman' then 'chairman' else u.position end,
      -- For managed rosters the browser matches this canonical published-official ID,
      -- not an editable display name or an arbitrary account ID.
      'official_id', (select o.id from vasra.officials o
        where o.published and not o.archived
          and lower(regexp_replace(btrim(o.name),'[[:space:]]+',' ','g')) =
              lower(regexp_replace(btrim(u.name),'[[:space:]]+',' ','g'))
          and o.position = case when u.role='chairman' then 'chairman' else u.position end
        order by o.display_order, o.id limit 1),
      'address', c.public_address,
      'email', c.contact_email,
      'phone', c.contact_phone,
      'facebook_url', c.facebook_url
    ) order by u.name)
    from vasra.officer_contact_details c
    join vasra.users u on u.id = c.user_id
    where c.is_public and not u.must_change and u.role in ('chairman','sk')
      and (c.public_address <> '' or c.contact_email <> ''
        or c.contact_phone <> '' or c.facebook_url <> '')
      and (select count(*) from vasra.users duplicate
           where duplicate.role in ('sk','chairman')
           and lower(regexp_replace(btrim(duplicate.name), '[[:space:]]+', ' ', 'g')) =
               lower(regexp_replace(btrim(u.name), '[[:space:]]+', ' ', 'g'))
          ) = 1
  ), '[]'::jsonb));
 end if;

 select u.* into actor from vasra.users u
 join vasra.sessions s on s.user_id = u.id
 where s.token = session_hash and s.expires > clock_timestamp()
 and u.role in ('sk','chairman') and not u.must_change limit 1;
 if actor.id is null then return jsonb_build_object('error',401); end if;

 if action = 'mine' then
  return jsonb_build_object(
   'officer_name', actor.name,
   'position', case when actor.role = 'chairman' then 'chairman' else actor.position end,
   'contact', coalesce((
     select jsonb_build_object('address',c.public_address,'email',c.contact_email,
       'phone',c.contact_phone,'facebook_url',c.facebook_url,'is_public',c.is_public)
     from vasra.officer_contact_details c where c.user_id = actor.id
   ), jsonb_build_object('address','','email','','phone','','facebook_url','','is_public',false))
  );
 end if;

 if action = 'save' then
  v_address := btrim(coalesce(payload->>'address',''));
  v_email := lower(btrim(coalesce(payload->>'email','')));
  v_phone := btrim(coalesce(payload->>'phone',''));
  v_facebook := btrim(coalesce(payload->>'facebook_url',''));
  v_public := coalesce((payload->>'is_public')::boolean,false);

  if length(v_address)>200 or length(v_email)>160 or length(v_phone)>35
     or length(v_facebook)>450
     or v_address ~ '[[:cntrl:]]' or v_email ~ '[[:cntrl:]]'
     or v_phone ~ '[[:cntrl:]]' or v_facebook ~ '[[:cntrl:]]'
     or (v_email<>'' and v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$')
     or (v_phone<>'' and v_phone !~ '^[+0-9(). \-]+$')
     or (v_facebook<>'' and v_facebook !~* '^https://(www\.|m\.)?facebook\.com/[A-Za-z0-9._~/?#=&%+\-]+$')
     or (v_public and v_address='' and v_email='' and v_phone='' and v_facebook='')
  then return jsonb_build_object('error',400); end if;

  insert into vasra.officer_contact_details
    (user_id,public_address,contact_email,contact_phone,facebook_url,is_public,updated_at)
  values (actor.id,v_address,v_email,v_phone,v_facebook,v_public,clock_timestamp())
  on conflict (user_id) do update set
    public_address=excluded.public_address,contact_email=excluded.contact_email,
    contact_phone=excluded.contact_phone,facebook_url=excluded.facebook_url,
    is_public=excluded.is_public,updated_at=excluded.updated_at;
  -- Audit only consent state; never copy contact details to the immutable audit log.
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
    values(actor.id,actor.name,'officer_contacts_updated',actor.id::text,
      jsonb_build_object('published',v_public));
  return jsonb_build_object('ok',true,'is_public',v_public);
 end if;
 return jsonb_build_object('error',404);
end $$;

revoke all on function public.vasra_officer_contacts(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_officer_contacts(text,jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
