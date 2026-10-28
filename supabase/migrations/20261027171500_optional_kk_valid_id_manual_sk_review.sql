-- Valid ID optional for KK Profiling: documents are helpful but no longer mandatory.
-- Keep ALL applicant details, voter responses, SK-only verification and consent checks intact.
-- Only removes the single documented requirement that an NCR profile MUST have
-- a row in vasra.kk_valid_ids to submit for SK review.
-- Apply after the 20261025043000 secure ID & voter review migration.
DO $optional$
DECLARE
 definition text;
 needle text := 'if coalesce(pr.profile->>''residence_region'','''')<>'''' and not exists(select 1 from vasra.kk_valid_ids d where d.member_id=m.id)';
 start_at integer;
 ending_at integer;
BEGIN
 definition:=pg_get_functiondef('public.vasra_kk(text,jsonb,text)'::regprocedure);
 start_at:=strpos(definition,needle);
 IF start_at=0 THEN
  RAISE EXCEPTION 'KK profile function has changed: optional-ID guard not found; review migration manually';
 END IF;
 IF strpos(substring(definition FROM start_at+length(needle)), 'end if;')>175 THEN
  RAISE EXCEPTION 'Unexpected valid ID submission check; manual review required';
 END IF;
 ending_at:=strpos(substring(definition FROM start_at),'end if;');
 IF ending_at=0 THEN
  RAISE EXCEPTION 'Unterminated KK Valid ID check; review migration';
 END IF;
 definition:=substring(definition FROM 1 FOR start_at-1)||
  '/* Optional Valid ID: SK officer still reviews identity before approval. */ '||
  substring(definition FROM start_at+ending_at+6);
 EXECUTE definition;
END
$optional$;
