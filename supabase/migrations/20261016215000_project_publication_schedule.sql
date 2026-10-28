-- SK VASRA: project release dates and scheduled publication (Asia/Manila UI).
-- Publishing is time-gated at the database layer; no background cron necessary.
ALTER TABLE vasra.projects ADD COLUMN IF NOT EXISTS publish_at timestamptz;
CREATE INDEX IF NOT EXISTS vasra_projects_publish_at_idx
 ON vasra.projects (publish_at) WHERE published;

DO $migration$
DECLARE fn text; oldpart text; newpart text;
BEGIN
 fn:=pg_get_functiondef('public.vasra_rpc(text,jsonb,text)'::regprocedure);
 IF fn IS NULL THEN RAISE EXCEPTION 'Expected vasra_rpc function absent'; END IF;
 oldpart:=$$'image_id',p.image_id,'updated',p.updated$$;
 newpart:=$$'image_id',p.image_id,'updated',p.updated,'publish_at',p.publish_at$$;
 IF position(oldpart in fn)=0 THEN RAISE EXCEPTION 'Cannot locate public-project fields'; END IF;
 fn:=replace(fn,oldpart,newpart);
 oldpart:=$$from vasra.projects p where p.published;$$;
 newpart:=$$from vasra.projects p where p.published AND (p.publish_at IS NULL OR p.publish_at<=clock_timestamp());$$;
 IF position(oldpart in fn)=0 THEN RAISE EXCEPTION 'Cannot locate public projects filter'; END IF;
 fn:=replace(fn,oldpart,newpart);
 -- Prevent retrieving unpublished/scheduled cover images without a staff session.
 oldpart:=$$where image_id=img.id and published))$$;
 newpart:=$$where image_id=img.id and published AND (publish_at IS NULL OR publish_at<=clock_timestamp())))$$;
 IF position(oldpart in fn)=0 THEN RAISE EXCEPTION 'Cannot locate cover-image privacy guard'; END IF;
 fn:=replace(fn,oldpart,newpart);
 oldpart:=$$insert into vasra.projects(id,title,category,description,scope,status,progress,published,image_id,created_by,updated_by)$$;
 newpart:=$$insert into vasra.projects(id,title,category,description,scope,status,progress,published,publish_at,image_id,created_by,updated_by)$$;
 IF position(oldpart in fn)=0 THEN RAISE EXCEPTION 'Cannot locate project insert'; END IF;
 fn:=replace(fn,oldpart,newpart);
 oldpart:=$$'(payload->>'published')::boolean,(payload->>'image_id')::uuid$$;
 newpart:=$$'(payload->>'published')::boolean,nullif(payload->>'publish_at','')::timestamptz,(payload->>'image_id')::uuid$$;
 -- Stored source has no quote before the (payload ... value. Check explicit below.
 oldpart:=$$(payload->>'published')::boolean,(payload->>'image_id')::uuid$$;
 newpart:=$$(payload->>'published')::boolean,nullif(payload->>'publish_at','')::timestamptz,(payload->>'image_id')::uuid$$;
 IF position(oldpart in fn)=0 THEN RAISE EXCEPTION 'Cannot locate project insert values'; END IF;
 fn:=replace(fn,oldpart,newpart);
 oldpart:=$$published=(payload->>'published')::boolean,image_id=$$;
 newpart:=$$published=(payload->>'published')::boolean,publish_at=case when payload->>'publication_mode'='keep' then old.publish_at else nullif(payload->>'publish_at','')::timestamptz end,image_id=$$;
 IF position(oldpart in fn)=0 THEN RAISE EXCEPTION 'Cannot locate project update'; END IF;
 fn:=replace(fn,oldpart,newpart);
 oldpart:=$$if action='save_project' then$$;
 newpart:=$$if action='save_project' then
  if coalesce(payload->>'publication_mode','') not in ('draft','now','schedule','keep') then return jsonb_build_object('error',400); end if;
  if payload->>'publication_mode'='schedule' AND (nullif(payload->>'publish_at','')::timestamptz is null OR nullif(payload->>'publish_at','')::timestamptz<=clock_timestamp()) then return jsonb_build_object('error',400,'reason','schedule_in_past'); end if;
  if payload->>'publication_mode'='keep' AND nullif(payload->>'id','') IS NULL then return jsonb_build_object('error',400); end if;$$;
 IF position(oldpart in fn)=0 THEN RAISE EXCEPTION 'Cannot locate project save action'; END IF;
 fn:=replace(fn,oldpart,newpart);
 EXECUTE fn;

 fn:=pg_get_functiondef('public.vasra_gallery(text,jsonb,text)'::regprocedure);
 IF fn IS NULL THEN RAISE EXCEPTION 'Expected vasra_gallery function absent'; END IF;
 oldpart:=$$p.id=pg.project_id AND p.published=true$$;
 newpart:=$$p.id=pg.project_id AND p.published=true AND (p.publish_at IS NULL OR p.publish_at<=clock_timestamp())$$;
 IF position(oldpart in fn)=0 THEN RAISE EXCEPTION 'Cannot locate public gallery'; END IF;
 fn:=replace(fn,oldpart,newpart);
 oldpart:=$$AND (p.published OR actor.id IS NOT NULL)$$;
 newpart:=$$AND ((p.published AND (p.publish_at IS NULL OR p.publish_at<=clock_timestamp())) OR actor.id IS NOT NULL)$$;
 IF position(oldpart in fn)=0 THEN RAISE EXCEPTION 'Cannot locate gallery image privacy guard'; END IF;
 fn:=replace(fn,oldpart,newpart);
 EXECUTE fn;
END $migration$;
NOTIFY pgrst,'reload schema';
