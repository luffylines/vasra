-- Keep token-bearing recovery rows inaccessible to public Data API roles.
-- SKVASRA uses service_role from the server; it bypasses RLS.
-- Do not add anon/authenticated policies to this private credential table.
ALTER TABLE vasra.kk_password_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE vasra.kk_password_resets FROM PUBLIC, anon, authenticated;

-- Support member dashboard attendance/points histories as event data grows.
-- Registration email and session/token lookups already have unique indexes.
CREATE INDEX IF NOT EXISTS kk_project_attendance_member_time_idx
  ON vasra.kk_project_attendance (member_id, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS kk_points_member_time_idx
  ON vasra.kk_points (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kk_id_card_audit_member_time_idx
  ON vasra.kk_id_card_audit (member_id, created_at DESC);
