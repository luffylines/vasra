-- Repair the KK Profile RPC's HTTP 403 (permission denied for table kk_valid_ids).
-- The table contains private uploaded-ID metadata and is accessed only through
-- server-authenticated KK endpoints. Its RLS stays enabled; no public grants.
-- Applied to dedicated VASRA Supabase project xetghdlwtqfnrdhdijfy as
-- migration 20261025051821_kk_valid_ids_server_role_permission_fix_20261025.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vasra.kk_valid_ids TO service_role;
