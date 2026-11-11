# KK n8n notification staging
The branch adds an opt-in transport for `POST /api/kk/staff/review` **after** the original `staff_review` RPC commits. No verification, points, or profile SQL is changed.

## Activation
1. Configure the n8n webhook with **Header Auth**: header name `X-SK-VASRA-Webhook-Secret`, value identical to Vercel `N8N_KK_WEBHOOK_SECRET`.
2. In n8n, confirm the existing validation node accepts `event_type=kk.verification.updated`, `status=approved|rejected`, `recipient_email`, `subject`, `html`, and `event_id`. Require strict checks and never accept browser-provided member identity.
3. Set the existing server-only `N8N_KK_WEBHOOK_URL` and `N8N_KK_WEBHOOK_SECRET` variables. The feature is **OFF** unless `N8N_KK_NOTIFICATIONS_ENABLED=true` is also set.
4. Test in an isolated preview database with fictional members. Keep the flag OFF in production until the webhook has persistent event deduplication.
5. The backend sends `Idempotency-Key` and deterministic `event_id`; the receiver **must** store completed IDs atomically (not memory-only) and skip already processed events. Revision is obtained from the review RPC when available. If the RPC does not expose a unique review transition identifier, add an event outbox in a separate reviewed migration before production activation.

## Delivery behavior
In n8n mode the backend does **not** also send via its existing direct Resend function. Webhook failure is returned as notification unavailable; the KK review transaction remains committed. This is intentionally not a reliable retry queue. Maintain the legacy direct sender while the flag is OFF, and do not turn n8n on in production without a durable outbox and deduplication solution.

Run `npm test` (or `node --test tests/kk-n8n-notifications.test.cjs`) before merging.
