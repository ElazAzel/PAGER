# PAGER administration

The administrator workspace is `/admin`; its read-only data endpoint is `GET /api/admin/overview?days=7` (or `30`). The interface supports Russian and English, touch controls, a mobile bottom navigation and a wider desktop layout. Assigned administrators also receive the workspace navigation entry.

## Assign access

1. Sign in using the normal verified Supabase email flow.
2. Obtain that account's immutable user ID from the Supabase Auth users console.
3. Set server-only `PAGER_ADMIN_USER_IDS` to that ID. Multiple IDs are comma-separated. Restart or redeploy after changing server configuration.

An empty allowlist grants nobody access. The helper accepts only a verified session identity. A creator/buyer role, `user_metadata`, an email address, a client flag, and a wildcard cannot grant administration. There is no self-promotion endpoint. Both the server page and data endpoint check authorization before loading the platform snapshot. Unauthenticated API requests return 401; authenticated, unlisted requests return 403. The page redirects unauthenticated visitors to sign-in and returns not-found to unlisted users. Responses are private and not stored; the page and API are excluded from indexing.

For an explicitly enabled loopback-only local demonstration, use the separate server-only `PAGER_DEMO_ADMIN_USER_IDS`, for example `creator-anna`. Demo identities require the existing signed local demo login. `PAGER_ADMIN_USER_IDS` does not authorize demo identities, and demo grants never authorize real mode. Empty demo configuration grants nobody access. Never enable local demo on a publicly reachable host.

## What the overview reports

- Current counts of accounts, creators, buyers, drafts/pages and published pages.
- A selected UTC calendar period of 7 or 30 days, including the unfinished current day: views, the sum of daily page visitors, clicks, provider-backed converted opportunities and conversions per active published page.
- Net confirmed receipts from the same verified payment ledger used by creator analytics, including renewals, minus cumulative refunds and open/lost disputes. Currency amounts remain separate in provider minor units. Payment-status labels alone do not qualify as receipts. Booking plus its payment count as one converted opportunity; renewal does not create another opportunity.
- Period payment/notification failure events, current failed/pending/due notifications, and disputed orders. Demo/test/sandbox transactions, owner traffic, identified bots, and suppressed notices are excluded. Zero recorded failures does not prove provider health.
- Up to 50 published pages ordered by period views, showing public titles/paths and aggregate counts. Draft names and private blocks are absent.
- Provider setup booleans/mode and aggregate stored creator connection counts. Presence of settings is not proof of successful OAuth, delivery, bookings or payments. Local demo clearly labels integrations inactive and excludes demo events from operating figures.

This platform overview ratio follows the selected calendar period. It is separate from the product specification's rolling-week North Star. Anonymous visitor tokens rotate daily; the visitor value is a sum of page/day visitors, not deduplicated people across dates or creators.

The DTO does not include user/contact names or emails, addresses, contact notes, booking titles, order details, private block data, asset paths, entitlement records, raw provider errors, provider account IDs or credentials. Admin client code receives only that DTO. Current operational data is read-only: this MVP does not impersonate users, refund payments, change access, replay provider jobs or suspend creators from the panel. Investigate provider failures in the corresponding provider console.

## Verification and operational limits

Run `pnpm exec vitest run tests/admin.test.ts` for anonymous/buyer/creator/forged-metadata denial, exact allowlist matching, demo isolation, server-page guards, no-store responses, bounded/safe projection, ledger totals, conversion deduplication and current queue filtering. The full repository access/payment/inventory tests and production build are still required before release.

The pilot storage repository reads a full state snapshot and serializes a small explicit DTO. This supports the accepted single-page-per-creator pilot. A larger deployment should move platform aggregation into bounded SQL queries with the same authorization and projection guarantees. Live Supabase/Stripe/Cal/Resend/Inngest delivery requires independent configured-environment verification; local automated tests do not establish external readiness.
