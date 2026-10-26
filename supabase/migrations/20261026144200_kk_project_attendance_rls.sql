-- Defense-in-depth for officer-only project attendance ledger.
-- All access goes through the service-role RPC with verified SK sessions.
ALTER TABLE vasra.kk_project_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vasra.kk_project_attendance FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON vasra.kk_project_attendance TO service_role;
