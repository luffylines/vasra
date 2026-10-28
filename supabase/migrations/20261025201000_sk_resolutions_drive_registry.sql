-- Private persistent SK Resolution Google Drive registry.
-- Public sees only explicitly published records via the server RPC.
CREATE TABLE IF NOT EXISTS vasra.sk_resolutions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 resolution_number text NOT NULL,
 title text NOT NULL,
 year integer NOT NULL CHECK(year BETWEEN 2000 AND 2100),
 approved_on date,
 description text NOT NULL DEFAULT '',
 drive_url text NOT NULL,
 published boolean NOT NULL DEFAULT false,
 created_by uuid REFERENCES vasra.users(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES vasra.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT sk_resolutions_number_year_unique UNIQUE(year,resolution_number),
 CONSTRAINT sk_resolutions_number_length CHECK(length(resolution_number) BETWEEN 2 AND 80),
 CONSTRAINT sk_resolutions_title_length CHECK(length(title) BETWEEN 3 AND 180),
 CONSTRAINT sk_resolutions_description_length CHECK(length(description)<=600),
 CONSTRAINT sk_resolutions_google_url CHECK(
  drive_url ~ '^https://(drive\.google\.com/(drive/folders/|file/d/|open\?id=)|docs\.google\.com/(document|spreadsheets|presentation)/d/)[A-Za-z0-9_-]+'
 )
);
CREATE INDEX IF NOT EXISTS sk_resolutions_public_order_idx
 ON vasra.sk_resolutions (published,year DESC,approved_on DESC);
ALTER TABLE vasra.sk_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vasra.sk_resolutions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON vasra.sk_resolutions TO service_role;

CREATE OR REPLACE FUNCTION public.vasra_sk_resolutions(
 action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 actor vasra.users;
 selected_id uuid;
 number_value text;
 title_value text;
 year_value integer;
 date_value date;
 desc_value text;
 url_value text;
 is_published boolean;
 saved vasra.sk_resolutions;
BEGIN
 IF action='public_list' THEN
  RETURN jsonb_build_object('ok',true,'resolutions',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'id',r.id,'number',r.resolution_number,'title',r.title,
    'year',r.year,'approved_on',r.approved_on,'description',r.description,
    'url',r.drive_url,'published_at',r.updated_at)
    ORDER BY r.year DESC,r.approved_on DESC NULLS LAST,r.created_at DESC)
   FROM vasra.sk_resolutions r WHERE r.published=true
  ),'[]'::jsonb));
 END IF;
 SELECT u.* INTO actor
 FROM vasra.sessions s JOIN vasra.users u ON u.id=s.user_id
 WHERE s.token=session_hash AND s.expires>clock_timestamp()
   AND u.role IN ('sk','chairman')
   AND u.disabled_at IS NULL AND NOT u.must_change
 LIMIT 1;
 IF actor.id IS NULL THEN RETURN jsonb_build_object('error',403); END IF;
 IF action='staff_list' THEN
  RETURN jsonb_build_object('ok',true,'resolutions',coalesce((
   SELECT jsonb_agg(jsonb_build_object('id',r.id,'number',r.resolution_number,
    'title',r.title,'year',r.year,'approved_on',r.approved_on,
    'description',r.description,'url',r.drive_url,
    'published',r.published,'updated_at',r.updated_at)
    ORDER BY r.year DESC,r.approved_on DESC NULLS LAST,r.created_at DESC)
   FROM vasra.sk_resolutions r
  ),'[]'::jsonb));
 END IF;
 IF action<>'save' THEN RETURN jsonb_build_object('error',404); END IF;
 number_value=btrim(coalesce(payload->>'number',''));
 title_value=btrim(coalesce(payload->>'title',''));
 desc_value=btrim(coalesce(payload->>'description',''));
 url_value=btrim(coalesce(payload->>'url',''));
 IF length(number_value) NOT BETWEEN 2 AND 80
  OR length(title_value) NOT BETWEEN 3 AND 180 OR length(desc_value)>600
  OR coalesce(payload->>'year','') !~ '^20[0-9]{2}$'
  OR length(url_value) NOT BETWEEN 35 AND 1500
  OR url_value !~ '^https://(drive\.google\.com/(drive/folders/|file/d/|open\?id=)|docs\.google\.com/(document|spreadsheets|presentation)/d/)[A-Za-z0-9_-]+'
  OR number_value ~ '[[:cntrl:]<>]' OR title_value ~ '[[:cntrl:]<>]'
 THEN RETURN jsonb_build_object('error',400); END IF;
 year_value=(payload->>'year')::integer;
 is_published=coalesce((payload->>'published')::boolean,false);
 IF coalesce(payload->>'approved_on','')<>'' THEN
  IF (payload->>'approved_on') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  THEN RETURN jsonb_build_object('error',400); END IF;
  date_value=(payload->>'approved_on')::date;
  IF extract(year from date_value)::integer <> year_value
  THEN RETURN jsonb_build_object('error',400); END IF;
 END IF;
 IF nullif(payload->>'id','') IS NOT NULL THEN
  IF (payload->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RETURN jsonb_build_object('error',400); END IF;
  selected_id=(payload->>'id')::uuid;
  UPDATE vasra.sk_resolutions r
   SET resolution_number=number_value,title=title_value,year=year_value,
       approved_on=date_value,description=desc_value,drive_url=url_value,
       published=is_published,updated_by=actor.id,updated_at=clock_timestamp()
   WHERE r.id=selected_id RETURNING r.* INTO saved;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
 ELSE
  INSERT INTO vasra.sk_resolutions(
    resolution_number,title,year,approved_on,description,drive_url,published,created_by,updated_by)
  VALUES(number_value,title_value,year_value,date_value,desc_value,url_value,
    is_published,actor.id,actor.id)
  RETURNING * INTO saved;
 END IF;
 INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
  VALUES(actor.id,actor.name,'sk_resolution_saved',saved.id::text,
   jsonb_build_object('number',number_value,'year',year_value,'published',is_published));
 RETURN jsonb_build_object('ok',true,'id',saved.id,'published',is_published);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('error',409);
END;
$fn$;
REVOKE ALL ON FUNCTION public.vasra_sk_resolutions(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_sk_resolutions(text,jsonb,text) TO service_role;
