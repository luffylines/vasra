# SK VASRA — Optional Email Two-Factor Authentication (2FA)

**Status (2026-11-03): preview deployed; database migration applied to the connected SK VASRA Supabase project; encrypted `MFA_CODE_SECRET` configured for Vercel preview and production. Full email delivery and end-to-end login have not yet been verified. Production website has not been switched to this feature branch.** Applies to SK Staff and KK Members (including Google OAuth, using the email challenge following OAuth).

## How members use 2FA
1. Log in and open **Account Settings**.
2. Switch on **Enable email verification**.
3. A six-digit code is sent to the account's currently registered email.
4. Enter the code within five minutes; only then does 2FA become ON.
5. On later password or Google sign-ins, enter the emailed six-digit code before any authenticated session is issued.
6. To switch 2FA OFF, start the switch-off request and verify a new email code. Other existing sessions are revoked when the setting changes.

The frontend does not store OTPs or passwords in localStorage/sessionStorage. Password hashes, OTP hashes, and session hashes stay server-side. The OTP has a five-minute expiry and five verification attempts. Sending requests and verification attempts are rate-limited.

**Do not assume email was delivered merely because Resend returned HTTP 2xx**. Check provider logs and actual inbox delivery in staging.

## Required setup before release
1. Verify the production sender domain in Resend. Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (or `MAIL_FROM_ADDRESS`) and optional `MAIL_FROM_NAME` in **Vercel server-side environment variables**. Do not expose secrets in the browser or GitHub.
2. Generate a new independent cryptographically random 32-byte-or-longer secret for `MFA_CODE_SECRET`. Example on a trusted computer: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store only in Vercel server environment variables. Never share the actual secret or paste it into support chats.
3. The migration in `supabase/migrations/20261103195000_optional_email_2fa.sql` has been applied to the connected project. Its RPC, columns, private challenge table, triggers, and restricted permissions were verified. All existing accounts retained 2FA OFF. **Important:** Vercel Preview and Production share that database. Enabling 2FA in preview for an actual account before production runs this code can prevent login on the old production deployment. Avoid enabling it on real production accounts until release.
4. Deploy the branch to a Vercel **preview** and configure its variables and matching `PUBLIC_ORIGIN`.
5. Test the scenarios below using dummy SK/KK accounts and a real inbox on a test domain.
6. Only after database compatibility, 2FA send/delivery, Google OAuth, session gates, and account recovery have been validated should the PR be merged and production migrated.

## Mandatory test matrix
- SK staff email/password: 2FA OFF normal login; ON email code required; correct code logs in.
- KK email/password: same; restricted accounts remain restricted.
- Staff Google OAuth and KK Google OAuth: when ON, OAuth redirects to email code screen before cookie; when OFF, previous login behavior works.
- KK Google-only accounts: can turn ON and OFF by email challenge and use Google + code; no password requirement.
- Wrong code: denied; after five wrong attempts challenge cannot complete. Expired code denied. A second request invalidates the previous code.
- Resend unavailable/rejected: no enable/disable state change, and 2FA-enabled login fails closed without issuing a session.
- Unauthorized requests cannot read/change another account's 2FA state.
- Existing sessions are revoked (except current) after toggling 2FA. Existing sessions do not bypass the newly enabled factor on fresh sign-in.
- Staff password change while ON rotates session securely; KK password change while ON remains functional.
- Reset password, account email change, disabled officer, Google relinking, mobile login, login rate limiting and concurrent verification must be tested.
- Check the database has `email_2fa_enabled` columns, `vasra.email_2fa_challenges`, the private `public.vasra_email_2fa` RPC, and both session triggers.
- Verify `anon` and `authenticated` cannot execute the RPC or read the 2FA challenge table.
- Verify Resend delivery and domain configuration on **staging**; don't use real personal KK records in test environments.

## Recovery considerations
Email-only 2FA assumes users retain access to their registered email. Provide a controlled manual recovery procedure with officer identity verification for loss of email access before launching, especially for Chairperson and Secretary accounts. Do not disable 2FA based solely on a support message or unauthenticated request.

## Implementation files
- Database: `supabase/migrations/20261103195000_optional_email_2fa.sql`
- API: `lib/handler.cjs`, `lib/supabase.cjs`
- Frontend: `dist/email-2fa-ui.js`, `dist/email-2fa-ui.css`, account and KK pages.
