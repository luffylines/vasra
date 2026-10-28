begin;
alter table vasra.users add column if not exists position text not null default 'kagawad' check (position in ('kagawad','treasurer','secretary'));
create or replace function public.vasra_rpc(action text, payload jsonb default '{}', session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 u vasra.users; target vasra.users; old vasra.projects; saved vasra.projects; img vasra.images;
 result jsonb; ident uuid; stamp timestamptz:=clock_timestamp(); count_hits integer; auth_hash text;
begin
 if action='health' then return jsonb_build_object('schema_version',2); end if;
 if action='rate_limit' then
  delete from vasra.rate_limits where window_start < stamp-interval '1 day';
  insert into vasra.rate_limits values(payload->>'key',stamp,1)
  on conflict(key) do update set hits=case when vasra.rate_limits.window_start < stamp-interval '15 minutes' then 1 else vasra.rate_limits.hits+1 end,
   window_start=case when vasra.rate_limits.window_start < stamp-interval '15 minutes' then stamp else vasra.rate_limits.window_start end
  returning hits into count_hits;
  return jsonb_build_object('allowed',count_hits <= (payload->>'limit')::integer);
 end if;
 if action='login_lookup' then
  select * into u from vasra.users where email=payload->>'email';
  return case when found then to_jsonb(u) else 'null'::jsonb end;
 end if;
 if action='login_commit' then
  select * into u from vasra.users where id=(payload->>'id')::uuid for update;
  if not found or u.role not in ('sk','chairman') or u.password<>payload->>'expected_password' then return jsonb_build_object('error',401); end if;
  delete from vasra.sessions where expires<stamp;
  insert into vasra.sessions values(payload->>'token',u.id,stamp+interval '8 hours');
  return to_jsonb(u)-'password';
 end if;
 if action='provision' then
  -- Permanent singleton plus row lock prevents simultaneous or repeated provisioning.
  if payload->>'email'<>'christianaring6@gmail.com' then return jsonb_build_object('error',403); end if;
  insert into vasra.provisioning(singleton,email) values(true,payload->>'email') on conflict do nothing;
  if not found then return jsonb_build_object('error',409); end if;
  if exists(select 1 from vasra.users where role='chairman' or email=payload->>'email') then
   raise exception using errcode='23505',message='Chairman already exists';
  end if;
  insert into vasra.users(name,email,password,role,must_change) values('SK Chairman',payload->>'email',payload->>'password','chairman',true) returning * into u;
  insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,'chairman_provisioned',u.id::text,'{}');
  return to_jsonb(u)-'password';
 end if;
 if action='public_projects' then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'category',p.category,'description',p.description,'scope',p.scope,'status',p.status,'progress',p.progress,'image_id',p.image_id,'updated',p.updated) order by p.updated desc),'[]') into result from vasra.projects p where p.published;
  return result;
 end if;
 -- Sessions are verified on every request, including after privilege/password changes.
 select usr.* into u from vasra.users usr join vasra.sessions s on usr.id=s.user_id
 where s.token=session_hash and s.expires>stamp and usr.role in ('sk','chairman') for share of usr;
 if action='me' then return case when u.id is null then 'null'::jsonb else to_jsonb(u) end; end if;
 if action='logout' then delete from vasra.sessions where token=session_hash; return '{"ok":true}'; end if;
 if action='image' then
  select * into img from vasra.images where id=(payload->>'id')::uuid and ready;
  if not found or ((u.id is null or u.must_change) and not exists(select 1 from vasra.projects where image_id=img.id and published)) then return jsonb_build_object('error',404); end if;
  return to_jsonb(img)-'chunks'-'upload_session';
 end if;
 if u.id is null then return jsonb_build_object('error',401); end if;
 if action='password' then
  -- Lock upgrade uses a global auth advisory lock to avoid shared-lock deadlocks.
  -- The caller may retry PostgreSQL serialization/deadlock failures safely.
  select * into u from vasra.users where id=u.id for update;
  if u.password<>payload->>'expected_password' then return jsonb_build_object('error',409); end if;
  update vasra.users set password=payload->>'password',must_change=false where id=u.id returning * into u;
  delete from vasra.sessions where user_id=u.id;
  insert into vasra.sessions values(payload->>'token',u.id,stamp+interval '8 hours');
  insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,'password_changed',u.id::text,'{}');
  return to_jsonb(u)-'password';
 end if;
 if u.must_change then return jsonb_build_object('error',403,'reason','password_change_required'); end if;
 if action='manage_projects' then
  select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('creator_name',c.name,'editor_name',e.name) order by p.updated desc),'[]') into result
  from vasra.projects p join vasra.users c on c.id=p.created_by join vasra.users e on e.id=p.updated_by;
  return result;
 end if;
 if action='save_project' then
  ident=coalesce((payload->>'id')::uuid,gen_random_uuid());
  if payload->>'id' is not null then
   select * into old from vasra.projects where id=ident for update;
   if not found then return jsonb_build_object('error',404); end if;
   if old.version<>(payload->>'version')::integer then return jsonb_build_object('error',409); end if;
  end if;
  if payload->>'image_id' is not null and not exists(select 1 from vasra.images where id=(payload->>'image_id')::uuid and ready) then return jsonb_build_object('error',400); end if;
  if old.id is null then
   insert into vasra.projects(id,title,category,description,scope,status,progress,published,image_id,created_by,updated_by)
   values(ident,payload->>'title',payload->>'category',payload->>'description',payload->>'scope',payload->>'status',(payload->>'progress')::integer,(payload->>'published')::boolean,(payload->>'image_id')::uuid,u.id,u.id) returning * into saved;
  else
   update vasra.projects set title=payload->>'title',category=payload->>'category',description=payload->>'description',scope=payload->>'scope',status=payload->>'status',progress=(payload->>'progress')::integer,published=(payload->>'published')::boolean,image_id=(payload->>'image_id')::uuid,updated_by=u.id,updated=stamp,version=version+1 where id=ident returning * into saved;
  end if;
  insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,case when old.id is null then 'project_created' else 'project_updated' end,ident::text,jsonb_build_object('before',case when old.id is null then null else to_jsonb(old) end,'after',to_jsonb(saved)));
  return to_jsonb(saved)||jsonb_build_object('creator_name',(select name from vasra.users where id=saved.created_by),'editor_name',u.name);
 end if;
 if action='upload_begin' then
  if (select count(*) from vasra.images where owner=u.id and not ready and expires>stamp)>=10 then return jsonb_build_object('error',429); end if;
  insert into vasra.images(mime,storage_path,owner,bytes,ready,upload_session,expires)
  values(payload->>'mime',payload->>'path',u.id,(payload->>'bytes')::integer,false,session_hash,stamp+interval '30 minutes') returning * into img;
  return to_jsonb(img);
 end if;
 if action in ('upload_get','upload_chunk','upload_finish') then
  select * into img from vasra.images where id=(payload->>'id')::uuid and owner=u.id and upload_session=session_hash and (ready or expires>stamp) for update;
  if not found then return jsonb_build_object('error',404); end if;
  if action='upload_chunk' then
   if img.ready then return jsonb_build_object('error',409); end if;
   if img.chunks ? (payload->>'index') and img.chunks->>(payload->>'index')<>payload->>'digest' then return jsonb_build_object('error',409); end if;
   update vasra.images set chunks=jsonb_set(chunks,array[payload->>'index'],to_jsonb(payload->>'digest')) where id=img.id returning * into img;
  end if;
  if action='upload_finish' and not img.ready then
   update vasra.images set ready=true where id=img.id returning * into img;
   insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,'image_uploaded',img.id::text,jsonb_build_object('mime',img.mime,'bytes',img.bytes));
  end if;
  return to_jsonb(img);
 end if;
 if u.role<>'chairman' then return jsonb_build_object('error',403); end if;
 if action='users' then select coalesce(jsonb_agg(to_jsonb(t) order by t.created desc),'[]') into result from (select id,name,email,role,position,created from vasra.users) t; return result; end if;
 if action='create_user' then
  if coalesce(payload->>'position','') not in ('kagawad','treasurer','secretary') then return jsonb_build_object('error',400); end if;
  insert into vasra.users(name,email,password,role,position,must_change) values(payload->>'name',payload->>'email',payload->>'password','sk',coalesce(payload->>'position','kagawad'),true) returning * into target;
  insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,'account_created',target.id::text,jsonb_build_object('name',target.name,'email',target.email,'role','sk'));
  return to_jsonb(target)-'password';
 end if;
 if action='role' then
  select * into target from vasra.users where id=(payload->>'id')::uuid for update;
  if not found then return jsonb_build_object('error',404); end if;
  if target.role='chairman' or target.id=u.id then return jsonb_build_object('error',403); end if;
  if payload->>'role' not in ('sk','youth') then return jsonb_build_object('error',400); end if;
  update vasra.users set role=payload->>'role' where id=target.id;
  delete from vasra.sessions where user_id=target.id;
  insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,'role_changed',target.id::text,jsonb_build_object('name',target.name,'before',target.role,'after',payload->>'role'));
  return '{"ok":true}';
 end if;
 if action='position' then
  select * into target from vasra.users where id=(payload->>'id')::uuid for update;
  if not found then return jsonb_build_object('error',404); end if;
  if target.role='chairman' or target.id=u.id then return jsonb_build_object('error',403); end if;
  if payload->>'position' not in ('kagawad','treasurer','secretary') then return jsonb_build_object('error',400); end if;
  update vasra.users set position=payload->>'position' where id=target.id;
  insert into vasra.audit(actor_id,actor_name,action,entity,details) values(u.id,u.name,'position_changed',target.id::text,jsonb_build_object('position',payload->>'position'));
  return '{"ok":true}';
 end if;
 if action='audit' then
  select coalesce(jsonb_agg(to_jsonb(t) order by t.id desc),'[]') into result from (select * from vasra.audit order by id desc limit 50 offset coalesce((payload->>'offset')::integer,0)) t;
  return jsonb_build_object('events',result,'total',(select count(*) from vasra.audit));
 end if;
 return jsonb_build_object('error',404);
end $$;
notify pgrst,'reload schema';
commit;
