# Facebook Post Import — SK VASRA

Open the signed-in SK Chairman dashboard → Manage Projects → New Project → Import from Facebook Post.

1. Paste a full public Facebook post HTTPS URL (e.g. `https://www.facebook.com/skbrgyvasra/posts/...`).
2. Choose **Analyze & Autofill**. VASRA attempts a bounded public Open Graph preview. Facebook may return a login page, rate limit, or block this preview. No Facebook account cookies or private APIs are used.
3. If metadata cannot be read, copy the publicly visible caption into the **Post caption** box, then Analyze again. This is the reliable no-Page-access path.
4. Optionally select screenshots or downloaded images using the upload control. They are added to the existing project gallery, subject to the existing limit of 12 images, maximum 5 MB each. A screenshot is treated as an image reference; it is **not OCR-parsed** and no Facebook album photos are fetched automatically.
5. Inspect the editable Title, Category, Summary, Scope (which includes the Facebook source link), status and progress. Imported content is **draft only**, status 0% / Pinaplano, and **Publish for everyone** remains unchecked. Manually review, choose cover, save and publish only with approval.

## Optional AI mode

Set `GROQ_API_KEY` as a **server-side** Vercel environment variable for the intended Preview/Production environments. Optional `GROQ_MODEL` overrides the default `llama-3.1-8b-instant`. Redeploy after adding variables. Never place the API key into browser JavaScript or source code. If the model cannot be reached or AI access is missing, the import falls back to basic caption-based field suggestions and reports that the basic method was used.

A public caption may be sent to the configured Groq service to generate text-only suggestions. Do not submit non-public personal data or details from private Facebook posts.

## Security and limitations

- The POST `/api/manage/projects/import-facebook` route is restricted to authenticated SK Chairman, requires normal same-origin CSRF checks, and is rate-limited.
- External metadata requests are restricted to explicitly allowed HTTPS Facebook hosts. Redirects are manually checked and only public HTML metadata is considered; response size and request time are capped.
- No project is created by importing or analyzing. Existing `save_project` and gallery upload validations continue to apply.
- Facebook metadata can be inaccessible or incomplete without the Page's official authorization. Photo albums cannot be imported automatically in this mode; images must be provided by the user.
- The app must never assert that auto-generated fields are official or verified. Chairman approval is required before publishing.
