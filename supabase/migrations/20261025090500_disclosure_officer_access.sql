-- Allow actively authenticated SK officers (chairman, kagawad, secretary, treasurer)
-- to manage Full Disclosure Board links; keep existing Google Drive validations,
-- private session checks and immutable audit logging.
CREATE OR REPLACE FUNCTION public.vasra_disclosure(action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor vasra.users; cat text; yr text; link text; publish boolean;
begin
 if action='public' then
  return jsonb_build_object('links',coalesce((
   select jsonb_agg(jsonb_build_object('category',category,'year',fiscal_year,'url',drive_url)
    order by category)
   from vasra.sk_disclosure_links where published and drive_url is not null
  ),'[]'::jsonb));
 end if;
 select u.* into actor from vasra.sessions s join vasra.users u on u.id=s.user_id
 where s.token=session_hash and s.expires>clock_timestamp() and u.role in ('sk','chairman')
  and not u.must_change and u.disabled_at is null limit 1;
 if not found then return jsonb_build_object('error',403);end if;
 if action='manage' then
  return jsonb_build_object('links',coalesce((
   select jsonb_agg(jsonb_build_object('category',category,'year',fiscal_year,
     'url',coalesce(drive_url,''),'published',published) order by category)
   from vasra.sk_disclosure_links
  ),'[]'::jsonb));
 end if;
 if action<>'save' then return jsonb_build_object('error',404);end if;
 cat=payload->>'category';yr=btrim(coalesce(payload->>'year',''));
 link=btrim(coalesce(payload->>'url',''));publish=coalesce((payload->>'published')::boolean,false);
 if cat not in ('cbydp','abyip','budget','rcb','purchase_requests') or
  yr !~ '^20[0-9]{2}(-20[0-9]{2})?$' or length(yr)>16 or length(link)>1500
 then return jsonb_build_object('error',400);end if;
 if link<>'' and not (
   link ~ '^https://drive[.]google[.]com/(drive/folders/|file/d/)[A-Za-z0-9_-]+'
   or link ~ '^https://docs[.]google[.]com/(document|spreadsheets|presentation|forms)/d/[A-Za-z0-9_-]+'
   or link ~ '^https://drive[.]google[.]com/open[?]id=[A-Za-z0-9_-]+'
 ) then return jsonb_build_object('error',400);end if;
 if publish and link='' then return jsonb_build_object('error',400);end if;
 insert into vasra.sk_disclosure_links(category,fiscal_year,drive_url,published,updated_by,updated_at)
 values(cat,yr,nullif(link,''),publish,actor.id,clock_timestamp())
 on conflict(category) do update set fiscal_year=excluded.fiscal_year,drive_url=excluded.drive_url,
 published=excluded.published,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into vasra.audit(actor_id,actor_name,action,entity,details)
 values(actor.id,actor.name,'disclosure_link_updated',cat,
 jsonb_build_object('category',cat,'year',yr,'published',publish));
 return jsonb_build_object('ok',true);
end $function$
;
REVOKE ALL ON FUNCTION public.vasra_disclosure(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_disclosure(text,jsonb,text) TO service_role;
