# PAGER platform release audit

Date: 2026-09-04  
Baseline revision: `39aeb482729344eb1320b132078a9f61ea057e33`

## Approved remediation scope

This audit is the implementation brief approved by the request to finish the platform and prepare it for GitHub + Fly.io deployment. It does not authorize a live deployment or the creation, disclosure, or rotation of provider secrets.

1. Validate the post-login return path before it reaches Next.js navigation. Accept only canonical same-origin paths; fall back to `/anna` for schemes, absolute URLs, protocol-relative URLs, backslash authority forms, controls, and encoded separators.
2. Preserve buyer login while carrying an explicit creator intent through OTP verification. Pilot mode must continue to require a server-side invite; non-pilot mode may self-enroll a verified creator.
3. Make real payments explicit opt-in. Runtime readiness must fail closed when an enabled provider or required operator contact is missing.
4. Replace legal placeholders with bilingual, configuration-aware privacy and terms pages. A real deployment is not ready until operator name and support email are configured and reviewed.
5. Group booking slots by local day, render one day at a time, and expose selected day and time through programmatic state.
6. Execute creator HTML/JavaScript only inside the existing unique-origin sandboxed iframe. Rich-text sanitization must remain unchanged and the iframe must never gain `allow-same-origin`.
7. Add an intentional RU/EN entry experience and keep the document language synchronized with the active screen.
8. Add an automated Chromium smoke gate plus the existing API/discovery checks to GitHub Actions.
9. Complete the web app manifest with installable PAGER icons.
10. Add a minimal standalone Docker image, fail-closed Fly health checks, a production deployment job gated by verification, and a no-secret deployment runbook.

## Release boundary

Local tests, a production build, a browser run, and a Docker boot prove only the repository artifact. Public release still requires a real Supabase project, applied migrations, HTTPS origin, configured operator contact, real OTP delivery, and any enabled Stripe/Cal.com/notification webhook checks. Demo operations and provider sandboxes are not traction.
