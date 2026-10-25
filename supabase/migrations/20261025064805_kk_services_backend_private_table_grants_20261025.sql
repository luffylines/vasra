-- Applied previously on VASRA Supabase; keep private tables staff server-only.
GRANT SELECT,INSERT,UPDATE,DELETE ON vasra.kk_service_requests,vasra.kk_service_settings TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON vasra.kk_points,vasra.kk_members,vasra.kk_profiles,vasra.kk_sessions TO service_role;
REVOKE ALL ON vasra.kk_service_requests,vasra.kk_service_settings FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.vasra_kk_services(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vasra_kk_services(text,jsonb,text) TO service_role;
