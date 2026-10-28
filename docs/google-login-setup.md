# VASRA login + Google OAuth activation (staged)

The login design has been modernized. Password login stays enabled. The Sign in with Google control is **disabled** until secure OAuth configuration AND the Google database migration are ready.

## Google Cloud setup

1. In Google Cloud Console create an OAuth consent screen and **Web application** OAuth client. Configure the necessary consent screen/test-user access.
2. Under Authorized redirect URIs add exactly:
   `https://vasra.vercel.app/api/auth/google/callback`
3. In Vercel > VASRA > Environment Variables configure **server-side** Production variables:
   - `GOOGLE_CLIENT_ID`: Web client ID (or `AUTH_GOOGLE_ID`).
   - `GOOGLE_CLIENT_SECRET`: Web client secret (or `AUTH_GOOGLE_SECRET`).
   - `GOOGLE_REDIRECT_URI=https://vasra.vercel.app/api/auth/google/callback` (or `AUTH_GOOGLE_REDIRECT_URI`).
   - Existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` remain server-only.
   - Do not paste secrets into code, chat, or screenshots.
4. Obtain separate OAuth credentials and redirect URIs for any preview/staging environment. The system intentionally requires `GOOGLE_REDIRECT_URI` to match that environment's trusted `PUBLIC_ORIGIN`. Ephemeral Vercel preview URLs do not automatically qualify.
5. **After explicit database approval**, review/apply `supabase/migrations/20261016144500_google_staff_login.sql` to the correct VASRA project. Never apply automatically from a code-only deployment.
6. Redeploy and confirm `GET /api/auth/google/status` returns `{"enabled":true}` on the chosen origin.
7. Test with an existing provisioned SK officer account that has completed its initial password change. Its Google email must match its registered SK account email. Google never creates new staff accounts and never gives Chairman privileges on its own. The first eligible login binds that person's immutable Google account ID (`sub`).
8. Test rejecting a Google identity with the wrong email, wrong existing `google_sub`, unverified email, expired authorization state, and OAuth cancellation.
9. After testing, promote the verified build to production using the configured Vercel workflow.

## Existing Resend values

Server-side email delivery supports `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`. Legacy `RESEND_FROM_EMAIL` is still accepted and takes priority if present. `MAIL_MAILER=resend` is optional metadata; it does not activate recovery by itself. `MAIL_FROM_ADDRESS` must be a verified sender in the connected Resend account.

Change Email and Forgot Password additionally require approved migration `supabase/migrations/20261016140000_account_recovery.sql` plus trusted HTTPS origin. Their controls remain disabled until `GET /api/account/capabilities` reports `{"ready":true}`.

## Security

- Google OAuth authorization code + PKCE, HMAC-signed short-lived state cookie, OIDC nonce and JWT signature verification against Google's published keys.
- Check issuer, audience, expiry, verified email, and immutable Google subject. No access token is exposed to client-side JavaScript.
- The server grants an 8-hour SK session only to an already-authorized `sk`/`chairman` record whose email matches the verified Google identity and linked subject.
- OAuth session cookies use SameSite=Lax for the cross-site Google redirect; normal password sessions remain SameSite=Strict. POST routes enforce the trusted origin.
- Production database migrations, access changes and provider secrets require explicit user authorization. Test using a non-production SK account where possible.

## Readiness diagnostics (2026-10-16)

The sign-in page now reads the server's safe readiness reason instead of displaying a generic "preview" message. The `GET /api/auth/google/status` response can contain:

- `enabled: true`: OAuth credentials, trusted callback URL and Supabase Google health are all ready.
- `reason: "oauth_not_configured"`: required server-side OAuth environment variables are missing.
- `reason: "redirect_mismatch"`: configured callback does not match this deployment's trusted origin. The production URL is `https://vasra.vercel.app/api/auth/google/callback`.
- `reason: "database_setup"`: Google login health did not report ready.
- `reason: "database_check_failed"`: database health request failed; this can be due to a missing migration/function or an outage. Check Supabase first.

The live VASRA Supabase project check on October 16 found **no `public.vasra_google_login` function**. Therefore Google login will stay disabled even when a Google OAuth client exists. Do not bypass the server-side readiness guard. The existing migration is explicitly staged, not auto-deployed.

Project progress quick actions are available for authorized staff on **drafts and completed projects**, including 100%-complete draft activities. Updating progress can correct the recorded status, but cannot publish the project. The Chairman must deliberately choose a publication mode in Edit Project.
