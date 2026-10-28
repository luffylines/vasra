# Private Activity Log IP recording

This migration is **not automatically applied** by pushing code to GitHub.
Activate only after explicit approval for production Supabase VASRA.

- `vasra.audit.ip_address` is a nullable Postgres `inet` column.
- A BEFORE INSERT trigger reads the server-provided `x-vasra-client-ip` sent by the VASRA backend to PostgREST. This is sourced from Vercel's proxy-observed address, validated as IPv4/IPv6 by Node.js. It is not user-entered content.
- Only new audit records after the migration may have IP. Historical rows remain NULL and appear as **Not recorded**.
- VPNs, carrier NAT and proxies can make the observed public IP differ from the device's private LAN IP.
- Do not add public read permissions. Only Chairperson-authenticated `/api/audit` may show IP addresses.
- Retention: audit records are immutable; decide and disclose a retention policy before enabling long-term collection.
- Quick inspection (no modification): `select id, action, created, ip_address from vasra.audit order by id desc limit 5;`.
- Verify in preview with authorized test action, then view Activity Log. Do not invent historical IPs.

The independent SK Duty `duty_overrides` permissions migration is still pending production approval, and is not part of this change.
