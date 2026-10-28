-- Restrict new KK dashboard tables to trusted server-side service role only.
-- RLS remains enabled and anon/authenticated receive no table privileges.
grant select,insert,update,delete on vasra.kk_project_participation to service_role;
grant select,insert,update,delete on vasra.kk_email_change_requests to service_role;
revoke all on vasra.kk_project_participation from public,anon,authenticated;
revoke all on vasra.kk_email_change_requests from public,anon,authenticated;
