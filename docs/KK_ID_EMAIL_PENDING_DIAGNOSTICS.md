# KK ID email pending: diagnostics (staging)
This change is limited to the **KK ID PDF email** pipeline, not the n8n KK profile-verification integration.
The SK-authorized `/api/kk/staff/id-cards/notify` response now returns a short, sanitized `email_notification.reason` when the send does not complete. Logs use the same reason without exposing member email, PDF, keys, or private storage paths.

### Common reasons
- `mailer_unconfigured`: verify production `RESEND_API_KEY` and verified sender (`RESEND_FROM_EMAIL` or `MAIL_FROM_ADDRESS`)
- `recipient_unavailable`: missing/invalid recipient email in staff-authorized ticket
- `attachment_missing`, `pdf_storage_unavailable`: verify approved PDF generation, private upload, and storage permissions
- `provider_not_accepted_401` / `403` / `422` / `429`: Resend rejected the request; inspect provider logs/configuration without exposing secrets
- `provider_timeout`, `provider_or_storage_error`: temporary network or storage failure
- `receipt_not_recorded`: Resend may have accepted the email, but the database acknowledgement failed; **verify provider status before retrying** to avoid duplicates
- `queue_claim_failed`, `queue_claim_rejected`: investigate the mail-queue RPC/migration state

The `Email: Accepted by provider` label is not confirmation of inbox delivery. In the Resend dashboard filter for the exact subject **Approved na ang SK VASRA Identification Card Mo**, not the unrelated n8n test subject.

The screenshot of empty Vercel runtime logs was filtered to 30 minutes; widen the range and trigger a single controlled retry in a staging test account if required. Do not retry live recipients blindly.

Run `node --test tests/kk-id-mail-diagnostics.test.cjs` and `npm test`. This patch deliberately does not change message deduplication, database transactions, points, or mail queue schema. Production correction still requires the actual reason code and staging verification.
