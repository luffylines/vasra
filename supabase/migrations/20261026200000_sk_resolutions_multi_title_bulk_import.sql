-- One resolution per year + trimmed number + trimmed title; repeated number with distinct title is valid.
-- Preserve every original record, UUID and published state.
ALTER TABLE vasra.sk_resolutions ADD COLUMN IF NOT EXISTS author text NOT NULL DEFAULT '';
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='vasra.sk_resolutions'::regclass AND conname='sk_resolutions_author_length')
 THEN ALTER TABLE vasra.sk_resolutions ADD CONSTRAINT sk_resolutions_author_length CHECK(length(author)<=600); END IF;
END $$;
ALTER TABLE vasra.sk_resolutions DROP CONSTRAINT IF EXISTS sk_resolutions_number_year_unique;
CREATE UNIQUE INDEX IF NOT EXISTS sk_resolutions_year_number_title_unique
 ON vasra.sk_resolutions(year,lower(btrim(resolution_number)),lower(btrim(title)));

CREATE OR REPLACE FUNCTION public.vasra_sk_resolutions(action text, payload jsonb DEFAULT '{}'::jsonb, session_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 actor vasra.users;
 selected_id uuid;
 number_value text;
 title_value text;
 year_value integer;
 date_value date;
 desc_value text;
 url_value text;
 author_value text;
 is_published boolean;
 saved vasra.sk_resolutions;
BEGIN
 IF action='public_list' THEN
  RETURN jsonb_build_object('ok',true,'resolutions',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'id',r.id,'number',r.resolution_number,'title',r.title,
    'year',r.year,'approved_on',r.approved_on,'description',r.description,'author',r.author,
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
    'description',r.description,'author',r.author,'url',r.drive_url,
    'published',r.published,'updated_at',r.updated_at)
    ORDER BY r.year DESC,r.approved_on DESC NULLS LAST,r.created_at DESC)
   FROM vasra.sk_resolutions r
  ),'[]'::jsonb));
 END IF;
 IF action<>'save' THEN RETURN jsonb_build_object('error',404); END IF;
 number_value=btrim(coalesce(payload->>'number',''));
 title_value=btrim(coalesce(payload->>'title',''));
 desc_value=btrim(coalesce(payload->>'description',''));
 author_value=btrim(coalesce(payload->>'author',''));
 url_value=btrim(coalesce(payload->>'url',''));
 IF length(number_value) NOT BETWEEN 2 AND 80
  OR length(title_value) NOT BETWEEN 3 AND 180 OR length(desc_value)>600 OR length(author_value)>600
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
       approved_on=date_value,description=desc_value,author=author_value,drive_url=url_value,
       published=is_published,updated_by=actor.id,updated_at=clock_timestamp()
   WHERE r.id=selected_id RETURNING r.* INTO saved;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',404); END IF;
 ELSE
  INSERT INTO vasra.sk_resolutions(
    resolution_number,title,year,approved_on,description,author,drive_url,published,created_by,updated_by)
  VALUES(number_value,title_value,year_value,date_value,desc_value,author_value,url_value,
    is_published,actor.id,actor.id)
  RETURNING * INTO saved;
 END IF;
 INSERT INTO vasra.audit(actor_id,actor_name,action,entity,details)
  VALUES(actor.id,actor.name,'sk_resolution_saved',saved.id::text,
   jsonb_build_object('number',number_value,'year',year_value,'published',is_published));
 RETURN jsonb_build_object('ok',true,'id',saved.id,'published',is_published);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('error',409,'reason','exact_duplicate');
END;
$function$;
CREATE OR REPLACE FUNCTION public.vasra_sk_resolutions_import(
 action text,payload jsonb DEFAULT '{}'::jsonb,session_hash text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $bulk$
DECLARE
 rows jsonb;
 item jsonb;
 result jsonb;
 ready jsonb;
 saved_count integer := 0;
 duplicate_count integer := 0;
 failed_count integer := 0;
 idx integer := 0;
 failures jsonb := '[]'::jsonb;
BEGIN
 IF action <> 'bulk_import' THEN RETURN jsonb_build_object('error',404); END IF;
 ready=public.vasra_sk_resolutions('staff_list','{}'::jsonb,session_hash);
 IF coalesce((ready->>'ok')::boolean,false) IS NOT TRUE
 THEN RETURN jsonb_build_object('error',403); END IF;
 rows=payload->'rows';
 IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows)<1 OR jsonb_array_length(rows)>150
 THEN RETURN jsonb_build_object('error',400,'reason','batch_size_1_to_150'); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(rows)
 LOOP
  idx=idx+1;
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
   failed_count=failed_count+1;
   failures=failures||jsonb_build_array(jsonb_build_object('row',idx,'reason','invalid_row'));
   CONTINUE;
  END IF;
  result=public.vasra_sk_resolutions('save',item,session_hash);
  IF coalesce((result->>'ok')::boolean,false) IS TRUE THEN
   saved_count=saved_count+1;
  ELSIF result->>'reason'='exact_duplicate' THEN
   duplicate_count=duplicate_count+1;
  ELSE
   failed_count=failed_count+1;
   failures=failures||jsonb_build_array(jsonb_build_object('row',idx,'reason',
     coalesce(result->>'reason','validation_error'),'error',result->>'error'));
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'saved',saved_count,'duplicates',duplicate_count,
  'failed',failed_count,'errors',failures);
END $bulk$;
REVOKE ALL ON FUNCTION public.vasra_sk_resolutions_import(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_sk_resolutions_import(text,jsonb,text) TO service_role;