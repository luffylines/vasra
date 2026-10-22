-- SK VASRA achievements and recognitions; Chairman approves every public entry.
-- Stage this migration for review before enabling write operations in production.
begin;
create table if not exists vasra.achievements (
 id uuid primary key default gen_random_uuid(),
 title varchar(180) not null check(length(btrim(title))>=3),
 category varchar(32) not null default 'Recognition' check(category in ('Award','Recognition','Milestone')),
 issuer varchar(180) not null check(length(btrim(issuer))>=2),
 award_date date not null check(award_date >= '2000-01-01' and award_date <= '2100-12-31'),
 description varchar(3000) not null,
 reference_url varchar(500),
 image_id uuid references vasra.images(id),
 published boolean not null default false,
 archived boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 created_by uuid references vasra.users(id),
 updated_by uuid references vasra.users(id)
);
create table if not exists vasra.achievement_images(achievement_id uuid not null references vasra.achievements(id) on delete cascade,image_id uuid not null references vasra.images(id),display_order integer not null check(display_order between 0 and 11),primary key(achievement_id,image_id),unique(achievement_id,display_order));
alter table vasra.achievement_images enable row level security;
revoke all on vasra.achievement_images from public,anon,authenticated;
grant select,insert,delete on vasra.achievement_images to service_role;
create index if not exists vasra_awards_published_date
 on vasra.achievements(award_date desc, created_at desc)
 where published and not archived;
alter table vasra.achievements enable row level security;
revoke all on vasra.achievements from public,anon,authenticated;
grant select,insert,update on vasra.achievements to service_role;

create or replace function public.vasra_awards(
 action text,payload jsonb default '{}'::jsonb,session_hash text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor vasra.users;
 target vasra.achievements;
 award_id uuid;
 photograph uuid;
 items jsonb; ids uuid[]; raw_ids jsonb; n integer;
begin
 if action='public' then
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'title',a.title,'category',a.category,'issuer',a.issuer,
   'award_date',a.award_date,'description',a.description,'reference_url',a.reference_url,
   'image_id',a.image_id,'image_ids',coalesce((select jsonb_agg(ai.image_id order by ai.display_order) from vasra.achievement_images ai where ai.achievement_id=a.id),'[]'::jsonb)) order by a.award_date desc,a.created_at desc),'[]'::jsonb)
   into items from vasra.achievements a where a.published and not a.archived;
  return jsonb_build_object('awards',items);
 end if;
 if action='image' then
  award_id:=nullif(payload->>'id','')::uuid;
  return coalesce((select jsonb_build_object('storage_path',i.storage_path,'mime',i.mime)
   from vasra.images i join vasra.achievement_images ai on ai.image_id=i.id join vasra.achievements a on a.id=ai.achievement_id
   where i.id=award_id and i.ready and a.published and not a.archived limit 1),
   jsonb_build_object('error',404));
 end if;
 select u.* into actor from vasra.users u join vasra.sessions s on u.id=s.user_id
  where s.token=session_hash and s.expires>clock_timestamp()
    and not u.must_change limit 1;
 if actor.id is null or actor.role not in ('chairman','sk') then return jsonb_build_object('error',403); end if;
 if action='image_manage' then
  award_id:=nullif(payload->>'id','')::uuid;
  return coalesce((select jsonb_build_object('storage_path',i.storage_path,'mime',i.mime)
   from vasra.images i join vasra.achievement_images ai on ai.image_id=i.id join vasra.achievements a on a.id=ai.achievement_id
   where i.id=award_id and i.ready and not a.archived and (actor.role='chairman' or a.created_by=actor.id or a.published) limit 1),
   jsonb_build_object('error',404));
 end if;
 if action='manage' then
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'title',a.title,'category',a.category,'issuer',a.issuer,
   'award_date',a.award_date,'description',a.description,'reference_url',a.reference_url,
   'image_id',a.image_id,'image_ids',coalesce((select jsonb_agg(ai.image_id order by ai.display_order) from vasra.achievement_images ai where ai.achievement_id=a.id),'[]'::jsonb),'published',a.published,'created_by',a.created_by) order by a.award_date desc,a.updated_at desc),'[]'::jsonb)
    into items from vasra.achievements a where not a.archived and (actor.role='chairman' or a.created_by=actor.id or a.published);
  return jsonb_build_object('awards',items);
 end if;
 if action='save' then
  if length(btrim(coalesce(payload->>'title','')))<3
   or length(coalesce(payload->>'title',''))>180
   or length(btrim(coalesce(payload->>'issuer','')))<2
   or length(coalesce(payload->>'issuer',''))>180
   or coalesce(payload->>'category','') not in ('Award','Recognition','Milestone')
   or coalesce(payload->>'award_date','') !~ '^\d{4}-\d{2}-\d{2}$'
   or length(coalesce(payload->>'description',''))>3000
   or length(coalesce(payload->>'reference_url',''))>500
   or (payload->>'reference_url' is not null
    and payload->>'reference_url'<>''
    and payload->>'reference_url' !~ '^https://[^[:space:]]+$')
  then return jsonb_build_object('error',400); end if;
  if actor.role<>'chairman' and coalesce((payload->>'published')::boolean,false) then return jsonb_build_object('error',403); end if;
  award_id:=nullif(payload->>'id','')::uuid;
  raw_ids:=payload->'image_ids';
  if jsonb_typeof(raw_ids) is distinct from 'array' or jsonb_array_length(raw_ids)>12 then return jsonb_build_object('error',400); end if;
  select coalesce(array_agg(x.value::uuid order by x.ordinality),'{}'::uuid[]) into ids from jsonb_array_elements_text(raw_ids) with ordinality x(value,ordinality);
  if cardinality(ids)<> (select count(distinct v) from unnest(ids) v) then return jsonb_build_object('error',400); end if;
  photograph:=ids[1];
  if exists(select 1 from unnest(ids) v where not exists(select 1 from vasra.images i where i.id=v and i.ready and (i.owner=actor.id or exists(select 1 from vasra.achievement_images ai join vasra.achievements a on a.id=ai.achievement_id where ai.image_id=v and ai.achievement_id=award_id and not a.archived and (a.created_by=actor.id or actor.role='chairman'))))) then return jsonb_build_object('error',400,'reason','image_unavailable'); end if;
  if photograph is not null and not exists(select 1 from vasra.images i
   where i.id=photograph and i.ready
   and (i.owner=actor.id or exists(select 1 from vasra.achievements a
    where a.id=award_id and a.image_id=i.id and not a.archived)))
   then return jsonb_build_object('error',400,'reason','image_unavailable'); end if;
  if award_id is not null then
   select * into target from vasra.achievements where id=award_id and not archived for update;
   if not found then return jsonb_build_object('error',404); end if;
   if actor.role<>'chairman' and (target.created_by is distinct from actor.id or target.published) then return jsonb_build_object('error',403); end if;
   update vasra.achievements set title=btrim(payload->>'title'),category=payload->>'category',
    issuer=btrim(payload->>'issuer'),award_date=(payload->>'award_date')::date,
    description=payload->>'description',reference_url=nullif(payload->>'reference_url',''),
    image_id=photograph,published=coalesce((payload->>'published')::boolean,false),
    updated_by=actor.id,updated_at=clock_timestamp()
    where id=award_id;
  else
   insert into vasra.achievements(title,category,issuer,award_date,description,reference_url,
    image_id,published,created_by,updated_by)
    values(btrim(payload->>'title'),payload->>'category',btrim(payload->>'issuer'),
     (payload->>'award_date')::date,payload->>'description',nullif(payload->>'reference_url',''),
     photograph,coalesce((payload->>'published')::boolean,false),actor.id,actor.id)
    returning id into award_id;
  end if;
  delete from vasra.achievement_images where achievement_id=award_id;
  for n in 1..coalesce(cardinality(ids),0) loop
   insert into vasra.achievement_images(achievement_id,image_id,display_order) values(award_id,ids[n],n-1);
  end loop;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
   values(actor.id,actor.name,'achievement_saved',award_id::text,
     jsonb_build_object('published',coalesce((payload->>'published')::boolean,false),'photos',cardinality(ids)));
  return jsonb_build_object('ok',true,'id',award_id);
 end if;
 if action='archive' then
  if actor.role<>'chairman' then return jsonb_build_object('error',403); end if;
  award_id:=nullif(payload->>'id','')::uuid;
  update vasra.achievements set archived=true,published=false,updated_by=actor.id,
   updated_at=clock_timestamp() where id=award_id and not archived;
  if not found then return jsonb_build_object('error',404); end if;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
   values(actor.id,actor.name,'achievement_archived',award_id::text,'{}'::jsonb);
  return jsonb_build_object('ok',true,'id',award_id);
 end if;
 return jsonb_build_object('error',404);
end $$;
revoke all on function public.vasra_awards(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_awards(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
