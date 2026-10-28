begin;
create table if not exists vasra.duty_overrides (
 day date primary key,
 mode text not null check(mode in ('closed','auto')),
 updated_by uuid not null references vasra.users(id),
 updated_at timestamptz not null default now()
);
alter table vasra.duty_overrides enable row level security;
create or replace function public.vasra_duty(action text, payload jsonb default '{}'::jsonb, session_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
 weekday integer := extract(isodow from (clock_timestamp() at time zone 'Asia/Manila'));
 actor vasra.users;
 mode_value text;
 assigned_names text[];
begin
 if action='status' then
  select d.mode into mode_value from vasra.duty_overrides d where d.day=today;
  return jsonb_build_object('date',today,'mode',coalesce(mode_value,'auto'));
 end if;
 if action<>'set' then return jsonb_build_object('error',404); end if;
 select u.* into actor from vasra.sessions s join vasra.users u on u.id=s.user_id
 where s.token=session_hash and s.expires>clock_timestamp() limit 1;
 if actor.id is null or actor.must_change or actor.role not in ('chairman','sk') then return jsonb_build_object('error',403); end if;
 if actor.role='sk' then
  assigned_names := case weekday
   when 1 then array['gel bergonio']
   when 2 then array['ernest bragais','kristine de ocampo']
   when 3 then array['sherwin estanislao']
   when 4 then array['rembert natividad']
   when 5 then array['arvin capiral']
   when 6 then array['kath irag']
   when 7 then array['roland reyes'] end;
  if lower(trim(actor.name)) <> all(assigned_names) then return jsonb_build_object('error',403,'reason','not_assigned_today'); end if;
 end if;
 if payload->>'mode' not in ('closed','auto') then return jsonb_build_object('error',400); end if;
 insert into vasra.duty_overrides(day,mode,updated_by,updated_at)
 values(today,payload->>'mode',actor.id,clock_timestamp())
 on conflict(day) do update set mode=excluded.mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into vasra.audit(actor_id,actor_name,action,entity,details)
 values(actor.id,actor.name,'duty_status_changed',today::text,jsonb_build_object('mode',payload->>'mode'));
 return jsonb_build_object('date',today,'mode',payload->>'mode');
end $$;
revoke all on function public.vasra_duty(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vasra_duty(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;