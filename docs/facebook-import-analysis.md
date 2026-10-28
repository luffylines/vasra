# SK VASRA: Facebook Caption Analysis

In Chairman → Manage Projects → New Project → Facebook URL + Groq AI, paste the URL and either use available public metadata or paste the actual caption.

**Important:** A Facebook post does not automatically represent a public project. Regular SK sessions, council meetings and advisories can reference education, internships and plans without being education projects themselves.

- Meeting first-line headings such as "OCTOBER 10, 2026 | 36TH SK VASRA REGULAR SESSION" are recognized as SK Regular Session (not Edukasyon), with their explicit meeting date. Deterministic classification prevails even if the AI hallucinates an education category.
- A factual, concise summary and relevant numbered resolutions are drafted separately. Source URL stays in scope, and no contents are fabricated.
- A completed meeting (the caption says it **naganap** or was held) can be marked completed for an **optional** project record. Meeting/announcement drafts are **not written into the project editor unless the Chairman chooses "Gamitin bilang project draft..."**. Never claim these are funded projects without verification.
- "Groq AI analysis successful" only appears after valid model output. If no key, the upstream API fails, times out or returns invalid JSON, a **basic analysis** is used and a safe reason/status is shown. Only HTTP status is exposed; the provider error body and key are never shown.
- Configure \`GROQ_API_KEY\` in Vercel environments appropriate for the actual deployment, including **Preview** if testing a preview hostname. Optional \`GROQ_MODEL\` can override the default. Redeploy after changing environment variables. On-screen missing-key status is specific to that deployment.
- No public Facebook album photos are downloaded without authorized Page access. Upload photos manually, up to 12; no OCR is performed on screenshots.
- Import never saves or publishes a project; the SK Chairman reviews details first.

Tests: \`node --test tests/facebook-import.test.cjs\`
