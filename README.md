# SK Vasra community portal

A responsive web/PWA portal with separate Projects, SK Duty, and Contacts pages. The public pages do not show a login link or registration controls. SK Duty opens directly at `/duty.html`, with seven day selectors, officer details, services, and the corresponding original poster. Old `/#duty` and `/#contacts` links redirect to the dedicated pages.

## Run locally

Use Node.js 24 or later. No npm packages are required.

```sh
node server.cjs
```

Open http://127.0.0.1:4173. On Windows, double-click `Start-SK-Vasra.cmd`. Keep the server running while using the portal. Opening HTML files directly will not provide project APIs or account features.

## Staff access

Open `/account.html` directly for the unlisted staff login. Hiding the link is only a navigation choice: the server independently restricts login and all management APIs to authorized SK officers and chairman. Public registration is disabled. Legacy youth accounts cannot log in; their sessions are rejected.

On a fresh installation, provision the chairman once:

```sh
node setup-chairman.cjs chairman@example.com
```

Read `data/chairman-first-login.txt` locally, change the temporary password at first login, then delete that note. Do not commit or share the note. The setup command refuses to overwrite an existing chairman or email.

The chairman creates SK accounts in **Mga account**, providing the officer's name and email. A random temporary password appears once for private handoff. The officer must change it before accessing the dashboard. The chairman can disable/re-enable SK access; changing a role revokes that account's sessions. Officers cannot create accounts or grant roles.

## Project workflow

SK officers and chairman can create projects, upload JPG/PNG/WebP images (up to 5 MB), save drafts, publish/unpublish, and edit projects. All SK officers may edit projects. Public visitors only see published projects and their images. Stale edits return a conflict instead of overwriting newer work.

The chairman can view creator/last-editor names and a paginated activity log with timestamps and before/after changes. Audit records cannot be edited or deleted through the application. Temporary passwords and password hashes are not written to the audit log. A server/database administrator still controls the underlying database.

## Storage and security

Database, sessions, account details, and uploaded images reside in `data/vasra.sqlite`, outside `dist`. Back up the entire data directory while the server is stopped. The `data` directory is ignored by Git and excluded from release ZIPs. Passwords use salted scrypt; sessions use random HttpOnly SameSite cookies. The service worker does not cache private APIs or the staff page. Mutating requests validate their origin, and login attempts are rate limited.

## Verification

```sh
node test.cjs
```

Tests run against a separate temporary database and cover disabled registration and youth login, role escalation prevention, origin validation, staff provisioning, forced password changes, session revocation, drafts/private images, uploads, publication, stale edit conflicts, authorship, audit immutability, logout, and persistence. Direct test invocation avoids the restricted environment's child-process test-worker limitation.

## Hosting

Pushing to GitHub does not deploy the website. This version requires a Node.js 24 host with persistent disk and an HTTPS reverse proxy; set `PUBLIC_ORIGIN` to the exact public HTTPS origin and `HOST`/`PORT` as required by the host. Use one server instance for this SQLite implementation. The retained `.openai/hosting.json` belongs to the earlier static prototype and cannot deploy the backend. Do not use GitHub Pages or publish only `dist` for the complete application.

Email verification and email-based password recovery are not configured. Account recovery currently requires the server administrator. Native APK/EXE installers are not included; installation remains via a supporting browser/PWA.

## Supplied content

Facebook: https://www.facebook.com/skbrgyvasra
Email: skbrgyvasraqc@gmail.com
Address: 40 Forestry St, Barangay Vasra, District 1, Quezon City
Office: Monday–Sunday, 9:00 AM–6:00 PM

The supplied SK branding, duty posters, names, services, and resolution text are preserved. Schedule selection uses the Asia/Manila timezone.
