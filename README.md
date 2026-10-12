# SK Vasra portal

## Run on this computer

Double-click `Start-SK-Vasra.cmd`, then open http://127.0.0.1:4173. Keep the server window open while using the portal. Alternatively run `node server.cjs`. Requires Node.js 24 or later; no npm packages are needed. Opening index.html directly shows contact content but does not provide working accounts or projects.

## Chairman account

The local chairman account is `christianaring6@gmail.com`. Its first-login instructions are in `data/chairman-first-login.txt` on this computer only. Change the temporary password at first login and delete the note afterward. Credentials and the database are deliberately excluded from the ZIP.

On a fresh computer, run `node setup-chairman.cjs YOUR_EMAIL` once before allowing registration. It refuses to overwrite an existing chairman or existing email. Then follow the first-login note. The database and uploaded images live in `data/vasra.sqlite`. Back up the whole data folder while the server is stopped; it contains personal data and must never be publicly served or committed.

## Roles and workflow

- Kabataan: register with name, email, and password; access their dashboard, published projects, duty schedule, and contacts.
- SK Officer: register normally, then the chairman assigns SK Officer in Mga account. Log in again after the role change. Create projects, upload PNG/JPG/WebP images (up to 5 MB), edit, save drafts, and publish/unpublish.
- SK Chairman: the SK project tools plus account role management and a paginated activity log. Project records show the creator and last editor. The log stores actor, timestamp, and before/after changes and cannot be edited/deleted through the API. The database owner can still control the underlying database.

Use the Publish checkbox to make a project visible to everyone. Drafts and their images require SK or chairman access. All SK officers can edit projects. Concurrent stale edits return a conflict instead of overwriting newer work. No demo projects are mixed with actual published records.

## Included content

Facebook: https://www.facebook.com/skbrgyvasra
Email: skbrgyvasraqc@gmail.com
Office: 40 Forestry St, Barangay Vasra, District 1, Quezon City
Duty: Monday–Sunday, 9:00 AM–6:00 PM. Officer names, services, resolution text, and all eight posters came from the supplied material. Poster links open the original images.

## Verification

Run `node test.cjs` (direct invocation avoids this environment's test-worker spawn restriction). It uses a separate temporary database and checks registration, role escalation prevention, CSRF origin validation, forced password change, session revocation, role assignment, private drafts/images, uploads, publication, concurrent edit conflicts, authorship, audit immutability, logout, and database persistence. Browser QA also covered chairman project creation and audit display, and the separate youth dashboard.

## Online deployment and limitations

This version runs locally. It is not deployed. The earlier Sites source helper failed, and the old static hosting manifest does not deploy this Node/SQLite backend. Do not publish only dist and expect login to work. Online deployment needs a Node.js 24 server with persistent disk, an HTTPS reverse proxy, and PUBLIC_ORIGIN set to the exact public HTTPS origin. Set HOST and PORT as required by that host. The database must stay outside the public directory. Use one server instance with this SQLite implementation. Native APK/EXE installers are not included; the portal remains a PWA.

Passwords use salted scrypt, sessions use random HttpOnly SameSite cookies, authorization is enforced server-side, and private API responses are not cached by the service worker. Registration/login attempts are rate limited per connecting IP. Email ownership verification, email password reset, and production email delivery are not yet configured. Account recovery currently requires the server administrator; do not collect real youth registrations publicly until the hosting, privacy process, and recovery workflow are ready.
