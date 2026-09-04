# PAGER: implementation of the approved 10-creator pilot

Approved scope: Kazakhstan/CIS, RU/EN, primarily phones with desktop support; leads and bookings, no new online payments. Preserve the existing commerce engine and already purchased rights. Operational admin with audited publication moderation. No new recipient/acquirer assumption.

## Delivery order and acceptance

1. Server capabilities, safe invitation-only creator enrollment capped atomically at 10, authoritative migrations, reproducible isolated demo and smoke runs. Existing creators remain compatible; user metadata cannot grant creator/admin privileges.
2. Editor: all 25 blocks, rich text, uploads, touch/keyboard ordering, real autosave/errors/conflicts, atomic versioned publication, complete catalog configuration and CRM timeline.
3. Booking: Cal OAuth/key connection, bounded provider availability and timezone selection, validated booking, verified provider confirmation, cancellation/reschedule, Resend/Inngest notifications with invalidation. No order when payments disabled. Unconfigured calendar offers a lead.
4. Public pages: clear primary CTA, mobile sticky action, desktop catalog layout, safe SSR metadata/JSON-LD/sitemap/robots, reserved aliases/redirects, separate public/private media, RU/EN. Search discovery never promised.
5. Analytics: privacy-aware view/click/action funnel, idempotent server facts, rolling-week North Star, activation and first outcome, isolated analytics/rate-limit SQL paths, raw90d/aggregate12mo retention. No PII or fake live revenue.
6. Admin: verified ID allowlist + real MFA, paginated safe creator search, publication block/restore with reason and expected version, append-only audit, honest integration health. Blocked publication cannot receive new visits/leads/bookings; existing bookings and entitlements remain.
7. Operations: staging/production readiness, health checks, errors without secrets, backup/restore runbook, database/HTTP/browser CI checks, installable web app without private offline caching, configured operator/privacy/terms/support before public launch.
8. Verify integrated access/payment/inventory regressions and build; browser checks at320/390/768/1440, real-device checks separately marked, isolated2creator/2buyer staging then2realcreators then10. Load100k analytics,50concurrent target, CWV lab/field distinction. Four-week business observation requires actual pilot use.

## Execution rules

Continue in the existing feat/pager-mvp checkout with the prior authorized uncommitted implementation. Agents own disjoint files; no resets or commits. Root integrates shared types/schema/server projections. Every status below must cite fresh evidence; provider accounts, real devices, legal operator details and actual pilot outcomes are external gates until observed.

## Progress

- Local implementation completed 2026-09-04: editor, Cal booking, operational admin, capabilities, invitations, publication/access invariants, migration integration, analytics/discovery and the UX/UI remediation are integrated in the working tree.
- Current local evidence: 270 tests in 32 files, lint/typecheck/build/diff check green; fresh isolated discovery/API smoke and CUA browser review are recorded in `docs/VERIFICATION.md`.
- No local agent is currently required. Live infrastructure credentials/domain/operator, real Supabase/Stripe/Cal/notifications, deployment, real-device checks, specialist accessibility checks and actual pilot outcomes remain external gates and are not claimed as complete.
