# SK VASRA caption analysis and upload feedback

## Caption-only project drafting
Chairman → Manage Projects → New Project → **Facebook Caption + AI**.

1. Paste the Facebook caption text directly; no URL field, Facebook scraping or Page admin access required.
2. **Analyze Caption & Autofill** sends caption text to \`POST /api/manage/projects/import-facebook\` under the SK Chairman session, with rate limit.
3. Groq, if configured for the current Vercel deployment environment, drafts a concise project title, category, summary and scope. If Groq fails or is unconfigured, the result explicitly says **Basic draft**, gives the reason when available, and asks for manual review. No provider keys or error bodies are exposed.
4. Caption classifier distinguishes sessions, announcements, planned projects and performed activities, and reads Filipino/English explicit event dates. A meeting/announcement needs explicit Chairman confirmation before its contents are transferred to the project editor.
5. Imported results remain **Draft**, never auto-saved or auto-published. Review status/progress and upload up to 12 images manually.

No Facebook URL is required, but this is not automatic extraction of Facebook posts or images. AI results may still have inaccuracies and require verification.

## Persistent photo upload toast
While \`#project-form\` uploads its gallery and saves the project, a **fixed toast within the open modal** stays visible at the upper-right with photo counts. It is not automatically dismissed after 10 seconds; this is intentional because uploads may be slow. On confirmed success, it disappears and a 10-second success toast is shown. On error, it disappears and the existing error toast is shown. Toast positions are responsive and support dark theme.

## Testing
\`node --test tests/facebook-import.test.cjs\` includes caption-only cases, SK Regular Session, completed clean-up, planning, announcement, Groq failures, and persistent progress UI checks.

Actual Groq API calls require the deployment's \`GROQ_API_KEY\` to be available for the target Vercel environment and are not tested with a live secret by this test suite.
