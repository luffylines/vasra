# Vercel emergency static fix

Vercel's read-only /var/task filesystem cannot run the current SQLite server. This branch configures the build to publish public pages from dist/ without invoking server.cjs, preventing the startup error. It is an intentionally limited public-only deployment, NOT a Supabase production migration.

The staff/account page is deliberately removed from the static output; the /api endpoints are unavailable. Public project data that depended on /api/projects will remain unavailable until the PostgreSQL + Vercel Functions migration is complete. The locally running Node+SQLite application is unchanged.

To validate locally: `node scripts/prepare-vercel-static.cjs` and verify `public/index.html` exists. Do not commit the generated public directory. For full functionality finish and test the migration/vercel-supabase branch, secure one-time chairman provisioning, and storage workflows before promotion.
