-- Correct the ambiguous PL/pgSQL weekday reference in existing VASRA databases.
-- This updates only function text, never the duty roster, office hours or override records.
begin;
do $fix$
declare ddl text;
begin
 select pg_get_functiondef(p.oid) into ddl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='vasra_duty'
 and pg_get_function_identity_arguments(p.oid)='action text, payload jsonb, session_hash text';
 if ddl is null then raise exception 'vasra_duty function is not installed'; end if;
 if position('where h.weekday=weekday;' in ddl)>0 then
  execute replace(ddl,'where h.weekday=weekday;',
   'where h.weekday=extract(isodow from (clock_timestamp() at time zone ''Asia/Manila''));');
 end if;
end $fix$;
notify pgrst, 'reload schema';
commit;
