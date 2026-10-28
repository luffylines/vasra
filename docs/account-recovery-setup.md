# VASRA SK account settings and recovery — activation checklist

The new public SK Youth Leaders layout, staff account settings UI, and icon polish are implemented on `migration/vercel-supabase`.

## Already usable without extra configuration

- Compact SK organizational structure; Duty roster is shown only as provisional data if no officially published directory exists.
- Modern Facebook footer icon, logout icon, Account Settings navigation.
- Authenticated Change Password through the existing `POST /api/password` endpoint.

## Requires explicit production approval

1. Review and apply the versioned migration `supabase/migrations/20261016140000_account_recovery.sql` to the verified VASRA Supabase project, after testing it on a staging database. **Never run this automatically from a UI-only deployment.**
2. Configure these *server-only* Vercel environment variables in the VASRA project (Production, and Preview only if testing the preview against an isolated/staging database):
   - `RESEND_API_KEY`: Resend API key with permission to send from your domain.
   - `RESEND_FROM_EMAIL`: Verified sender address, e.g. `noreply@your-verified-domain.example`.
   - `PUBLIC_ORIGIN`: Trusted HTTPS origin used for one-time account links. On Vercel production the app uses `https://vasra.vercel.app`; for Preview it uses the deployment URL.
3. Redeploy, then check `GET /api/account/capabilities` returns `{"ready":true}`. Otherwise, Change Email and Forgot Password stay disabled with a setup notice.
4. Test with a dedicated SK test account, not the real Chairman account:
   - Login, change password, confirm old credentials no longer work.
   - Change email: verify message reaches **new** inbox; clicking link changes address and signs out other sessions.
   - Reset password: request from the login page; check generic responses for both existing and non-existing emails, expiry (30m), one-time use, all sessions invalidated.
   - Check invalid tokens, attempts over limits, and email provider outages do not expose secrets.
   - Confirm a regular SK account cannot use Chairman-only official editing.
5. Preview-check desktop and phone layouts; publish to production only after verification.

## Security notes

Tokens are random and stored only as SHA-256 hashes, with expiry and consumption upon use. Neither public/anon nor authenticated Supabase roles may call the dedicated account function. Change Email requires a correct current password and a link delivered to the new inbox. Reset requests do not disclose whether an email belongs to an account. Never paste API keys or token URLs in a public chat or screenshots.
