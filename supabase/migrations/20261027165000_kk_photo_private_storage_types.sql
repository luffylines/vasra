-- Private KK identity bucket must support approved ID photo WEBP and 2-sided PDF.
-- Keep this bucket PRIVATE; existing 2.5 MB applicant Valid ID upload limits
-- remain enforced by the API independently of the bucket's 3 MB ceiling.
DO $bucket$
BEGIN
 UPDATE storage.buckets
 SET public=false,file_size_limit=3000000,
     allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','application/pdf']
 WHERE id='vasra-kk-identity' AND public=false;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Private KK identity bucket missing or not private; refusing unsafe update';
 END IF;
END
$bucket$;
