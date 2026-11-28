-- Prevent new duplicate SK project titles while preserving legacy duplicate records.
-- Normalize Unicode, case, leading/trailing spaces, and repeated whitespace.
-- Advisory transaction locks serialize concurrent inserts/renames.
CREATE OR REPLACE FUNCTION public.vasra_prevent_duplicate_project_title()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $$
DECLARE normalized_title text;
BEGIN
 normalized_title := lower(regexp_replace(btrim(normalize(coalesce(NEW.title,''), NFKC)), E'\\s+', ' ', 'g'));
 IF normalized_title = '' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND normalized_title = lower(regexp_replace(btrim(normalize(coalesce(OLD.title,''), NFKC)), E'\\s+', ' ', 'g')) THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(normalized_title, 0));
 IF EXISTS (
  SELECT 1 FROM vasra.projects p
  WHERE p.id IS DISTINCT FROM NEW.id
    AND lower(regexp_replace(btrim(normalize(coalesce(p.title,''), NFKC)), E'\\s+', ' ', 'g')) = normalized_title
 ) THEN
  RAISE EXCEPTION 'A project with this title already exists'
   USING ERRCODE='23505', CONSTRAINT='vasra_projects_title_normalized_unique';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vasra_projects_prevent_duplicate_title ON vasra.projects;
CREATE TRIGGER vasra_projects_prevent_duplicate_title
BEFORE INSERT OR UPDATE OF title ON vasra.projects
FOR EACH ROW EXECUTE FUNCTION public.vasra_prevent_duplicate_project_title();
NOTIFY pgrst, 'reload schema';
