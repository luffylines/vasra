-- Stage before production approval: Chairman-only officer removal with audit history.
-- Preserves existing entries; archived rows are excluded from public and admin listings.
begin;
alter table vasra.officials add column if not exists archived boolean not null default false;
grant select, insert, update on table vasra.officials to service_role;
-- Server-only transparency RPC. Requires transparency_tables migration.
CREATE OR REPLACE FUNCTION public.vasra_transparency(action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare u vasra.users; yr integer; finance boolean; d date; mid uuid;
begin
 yr:=coalesce((payload->>'year')::integer,extract(year from (now() at time zone 'Asia/Manila'))::integer);
 if yr<2000 or yr>2100 then return jsonb_build_object('error',400); end if;
 if action='public' then
 return jsonb_build_object('year',yr,
 'budget',(select to_jsonb(b) - 'updated_by' from vasra.annual_budgets b where b.year=yr and b.published),
 'updates',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',p.title,'project_id',p.id,'month',m.month,'summary',m.summary,'expense',m.expense) order by m.month desc,p.title)
  from vasra.monthly_updates m join vasra.projects p on p.id=m.project_id where m.published and p.published and extract(year from m.month)=yr),'[]'::jsonb),
 'officials',coalesce((select jsonb_agg(jsonb_build_object('name',o.name,'position',o.position) order by o.display_order,o.name) from vasra.officials o where o.published and not o.archived),'[]'::jsonb),
 'directory_managed',(select exists(select 1 from vasra.officials)));
 end if;
 select x.* into u from vasra.users x join vasra.sessions s on x.id=s.user_id
 where s.token=session_hash and s.expires>now() and x.role in ('sk','chairman') and not x.must_change limit 1;
 if u.id is null then return jsonb_build_object('error',401); end if;
 finance:=u.role='chairman' or u.position='treasurer';
 if action='manage' then
  return jsonb_build_object('year',yr,
  'budget',(select to_jsonb(b) - 'updated_by' from vasra.annual_budgets b where b.year=yr),
  'updates',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('title',p.title) order by m.month desc) from vasra.monthly_updates m join vasra.projects p on p.id=m.project_id where extract(year from m.month)=yr),'[]'::jsonb),
  'officials',coalesce((select jsonb_agg(to_jsonb(o) order by o.display_order,o.name) from vasra.officials o where not o.archived),'[]'::jsonb),
  'directory_management_v2',true);
 end if;
 if action='budget' then
  if not finance then return jsonb_build_object('error',403); end if;
  if (payload->>'amount')::numeric<0 then return jsonb_build_object('error',400); end if;
  insert into vasra.annual_budgets(year,amount,reference,published,updated_by)
  values(yr,(payload->>'amount')::numeric,left(coalesce(payload->>'reference',''),300),coalesce((payload->>'published')::boolean,false),u.id)
  on conflict(year) do update set amount=excluded.amount,reference=excluded.reference,published=excluded.published,updated_by=u.id;
  insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,'budget_updated',yr::text,jsonb_build_object('amount',payload->>'amount','published',payload->>'published'));
  return '{"ok":true}'::jsonb;
 end if;
 if action='month' then
  d:=(payload->>'month')::date;
  if extract(day from d)<>1 or length(trim(coalesce(payload->>'summary',''))) not between 3 and 2000 then return jsonb_build_object('error',400); end if;
  if (payload->>'expense') is not null and not finance then return jsonb_build_object('error',403); end if;
  if coalesce((payload->>'published')::boolean,false) and not finance then return jsonb_build_object('error',403); end if;
  if not finance and exists(select 1 from vasra.monthly_updates where project_id=(payload->>'project_id')::uuid and month=d and (expense is not null or published)) then return jsonb_build_object('error',403); end if;
  if not exists(select 1 from vasra.projects where id=(payload->>'project_id')::uuid) then return jsonb_build_object('error',404); end if;
  insert into vasra.monthly_updates(project_id,month,summary,expense,published,updated_by)
  values((payload->>'project_id')::uuid,d,trim(payload->>'summary'),(payload->>'expense')::numeric,coalesce((payload->>'published')::boolean,false),u.id)
  on conflict(project_id,month) do update set summary=excluded.summary,expense=excluded.expense,published=excluded.published,updated_by=u.id;
  insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,'monthly_update',payload->>'project_id',jsonb_build_object('month',d,'expense',payload->>'expense','published',payload->>'published'));
  return '{"ok":true}'::jsonb;
 end if;
 if action='official' then
  if u.role<>'chairman' then return jsonb_build_object('error',403); end if;
  if length(trim(coalesce(payload->>'name',''))) not between 2 and 100 or payload->>'position' not in ('chairman','kagawad','treasurer','secretary') then return jsonb_build_object('error',400); end if;
  if payload->>'id' is not null and not exists(select 1 from vasra.officials where id=(payload->>'id')::uuid and not archived) then return jsonb_build_object('error',404); end if;
  mid:=coalesce((payload->>'id')::uuid,gen_random_uuid());
  insert into vasra.officials(id,name,position,display_order,published,updated_by)
  values(mid,trim(payload->>'name'),payload->>'position',coalesce((payload->>'sort')::integer,10),coalesce((payload->>'published')::boolean,false),u.id)
  on conflict(id) do update set name=excluded.name,position=excluded.position,display_order=excluded.display_order,published=excluded.published,updated_by=u.id;
  insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,'official_updated',mid::text,jsonb_build_object('name',payload->>'name','position',payload->>'position'));
  return jsonb_build_object('ok',true,'id',mid);
 end if;
 if action='official_remove' then
  if u.role<>'chairman' then return jsonb_build_object('error',403); end if;
  if nullif(payload->>'id','') is null then return jsonb_build_object('error',400); end if;
  mid:=(payload->>'id')::uuid;
  update vasra.officials set archived=true,published=false,updated_by=u.id where id=mid and not archived;
  if not found then return jsonb_build_object('error',404); end if;
  insert into vasra.audit(actor_id,actor_name,action,entity,details)
  values(u.id,u.name,'official_removed',mid::text,jsonb_build_object('id',mid));
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error',404);
end $function$;

revoke all on function public.vasra_transparency(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_transparency(text,jsonb,text) to service_role;
notify pgrst,'reload schema';

commit;
