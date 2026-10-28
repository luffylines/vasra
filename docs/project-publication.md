# SK VASRA Project Publication Date and Scheduling

## Public project cards
The public **Mga proyekto** card and its **See More** dialog display the verified publication timestamp in Philippine Time (Asia/Manila). Older projects published before this field was introduced use "Petsa hindi naitala" rather than an invented date.

## Staff project form
SK staff can choose **Save as Draft**, **Publish Now**, or **Schedule Publication** under Project publication. The schedule uses a Philippine local date/time input and is converted to UTC before submission. Edit forms for already-published projects default to **Keep existing publication date/schedule**, so regular updates do not modify historical publication timestamps.

Public visibility is enforced by PostgreSQL, not just the front end: when `published=true`, a future `publish_at` excludes the project from public lists and excludes its gallery and cover images from unauthenticated access. Scheduled entries automatically become visible when the specified time arrives, on subsequent HTTP requests to public pages. No cron job is needed.

The `publish_at` column is nullable for legacy records. The publication date is not backfilled from a project's creation or update time, because those timestamps are not proof of when a project was published.

## Testing
- UI code tests: `node --test tests/project-publication.test.cjs`.
- DB transactional tests verify future dates hide projects and images while past dates expose them; transactions are rolled back.
- Existing publication timestamps are preserved when editing with the Keep option.

## Deployment
Apply migration `supabase/migrations/20261016215000_project_publication_schedule.sql` **before deploying** the application code. It changes `public.vasra_rpc` and `public.vasra_gallery` in addition to adding the column. Then deploy the `migration/vercel-supabase` branch through Vercel.
