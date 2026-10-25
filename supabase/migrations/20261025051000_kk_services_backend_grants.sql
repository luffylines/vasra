-- Backend may read/write SK-private service tables; browser roles remain denied.
grant select,insert,update on vasra.kk_service_requests to service_role;
grant select,insert,update on vasra.kk_service_settings to service_role;
notify pgrst,'reload schema';
