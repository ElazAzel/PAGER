# PAGER page analytics

The creator report is `GET /api/analytics/report?days=7|30|90`. Authentication is required. Only a creator can read it; the owner comes from the verified session. Caller-selected owners and pages are rejected. Responses use `Cache-Control: private, no-store` and `Vary: Cookie`. Only aggregate values and the creator's own published block labels are returned, without visitor identifiers, contacts, orders, assets or credentials.

The report UI is available in Russian and English. The same panel supports a phone and a computer, with 44 px period controls, responsive charts, an accessible daily table, loading/error/retry states and an explicit empty state. The local demo is labeled. Demo events are excluded; the UI does not substitute a made-up growth chart.

## Definitions

- Period: 7, 30 or 90 UTC calendar dates, including the current partial day. Start is 00:00 UTC on the first date; end is the server's current time. Future events are excluded. This chart window is separate from the original North Star rolling 168-hour window in `calculateMetrics`.
- Visits: accepted page-view events, excluding owner, test, demo and known automated traffic. A fresh event ID records a distinct page load; retransmission of that ID is idempotent. Legacy clients without event IDs remain deduplicated per page, visitor and UTC day.
- Daily visitors: distinct page/day visitor keys with an observed view. Period totals sum daily unique counts. The same person returning on another day or browser session can count again. This is not a count of distinct people across devices or the entire period.
- Clicks: accepted click events on existing, visible published blocks to which the caller has access, plus explicit access-purchase CTA signals. A normal click requires a block ID and material access. `block_access` records a visible paid teaser with a valid published price without requiring access to that block's protected body; the whole page must still be accessible. `page_access` records a paid whole-page CTA with a valid published price and no block ID. These actions record interest only and never create orders or grants. Block labels come from the published snapshot. Archived or hidden blocks do not appear in the current block ranking.
- Click engagement: daily page-scoped visitors with an observed view and at least one click, divided by visitors with an observed view. It is `null` when no views were observed. Clicks without an observed view remain clicks but do not inflate the engagement rate.
- Form enquiries: non-test form opportunities created in the period, scoped to the creator and a valid contact; the creator's own contact email is excluded.
- Confirmed bookings: non-test, currently confirmed bookings with a Cal.com provider ID, created in the period. Cancelled bookings are excluded.
- Paid orders: distinct orders with a positive qualifying net payment in the period. Pending orders and client-side checkout returns do not count.
- Conversions: distinct non-test opportunities first marked converted during the period, backed by a currently confirmed provider booking or a qualifying positive paid amount. A booking and its payment reuse the same opportunity and count once. A renewal does not create a new conversion. Refunded/disputed payments with no remaining positive amount and cancelled bookings no longer support a conversion by themselves.
- Repeat customers: contacts with a conversion in the period and an earlier, independently converted opportunity. One contact counts once in the report.
- Funnel intent events: anonymous, block-scoped clicks for `form_open`, `form_submit`, `booking_start` and `booking_confirmed`. They show where visitors expressed intent; they are not joined to a CRM contact or counted as a conversion unless the server records the corresponding outcome.
- Receipts: paid facts in the server-owned Stripe payment ledger, including renewals and shipping, less cumulative recorded refunds. Open/lost disputed payments contribute zero. Each payment belongs to the period of its original `paidAt`; later refunds/disputes can restate that historical period. Values are stored in minor units and grouped by currency. They are before payment-provider fees and are not bank payouts or an accounting cash-flow statement. Payments in different currencies are never added together.

Outcome and intent counts are independent observations. There is no identity join between anonymous visitors and CRM/payment records, so this panel does not claim visitor-to-payment attribution or a visitor conversion rate. Sources and devices are traffic dimensions, not verified attributes of individual customers.

## Collection, privacy and abuse boundaries

`POST /api/analytics` accepts only:

```ts
{
  pageId: string;
  kind: "view" | "click";
  visitorId: string; // Random, page/session-scoped client token; never persisted raw.
  eventId?: string; // New ID per event; reuse only when retrying the same event.
  blockId?: string; // Required for normal/block-access clicks; forbidden for page_access.
  action?: "page_access" | "block_access" | "form_open" | "form_submit" | "booking_start" | "booking_confirmed"; // Bounded public intent or access CTA.
  source?: "direct" | "search" | "social" | "ai" | "referral" | "unknown";
  device?: "mobile" | "tablet" | "desktop" | "unknown";
}
```

The strict request schema rejects financial kinds, arbitrary custom fields, raw referrer URLs, amount, owner, time and test flags. Timestamps, page ownership and demo/test status are server-owned. Block access is checked against the published page and current entitlements. Same-origin requests and both request/resource rate limits are required.

The server rehashes the visitor token with the page ID and UTC date before storage. Analytics does not store raw IPs, user-agent strings, referrer URLs, query strings, names or emails. Rate limiting separately uses an existing short-lived hashed request budget. No geographic inference, location database or cross-page identifier is added.

Requests with `DNT: 1` or `Sec-GPC: 1` are skipped. Known bot/crawler, headless and preview user agents are skipped without storing an analytics row. This is a heuristic, not a guarantee that every automated or abusive request can be detected. Public traffic counters are descriptive signals and cannot authorize access or confirm a financial outcome.

Referrer classification happens on the client; only a bounded category is sent. Missing source information is `unknown` for legacy events. An `ai` referral means an observed visit from a recognized AI service, not an impression, citation or ranking in AI answers. Search Console and equivalent provider-side impression/query data are not imported or fabricated.

Existing JSONB payload storage persists the new optional dimensions; no migration is required. This MVP still uses the shared repository state transaction. A high-volume event pipeline, retention/rollup job and database-side analytical queries are future scaling work, not current capabilities.

## Sources and implementation choices

Reviewed 2026-09-03:

- [Plausible data policy](https://plausible.io/data-policy) and [open-source analytics repository](https://github.com/plausible/analytics): reference for bounded anonymous measurement and daily identifiers. PAGER does not copy its code or fingerprint from IP/user-agent data; it uses an ephemeral client token.
- [Plausible events API](https://plausible.io/docs/events-api): reference for distinguishing event collection from reporting and treating request metadata carefully.
- [Umami documentation](https://docs.umami.is/docs): reference for separating visits, visitors, events, sources and device dimensions. PAGER does not enable visitor profiles, session replay or cross-device identities.
- Bundled Next.js 16.3.4 App Router guides for route handlers, server/client component boundaries and CSS modules.
- `src/lib/integrations/transitions.ts` and `stripe.ts`: the authoritative existing payment confirmation/refund/dispute ledger. `src/lib/integrations/bookings.ts`: the existing verified Cal.com booking flow.

## Verification

`tests/analytics-report.test.ts` verifies scoped reports, idempotent collection, distinct load/visitor counts, day/page rekeying, blocked financial kinds, owner/test/bot exclusions, UTC boundaries, empty denominators, click engagement, payment ledger receipts, multiple currencies, renewals, partial refunds, disputes and duplicate conversion prevention.

`tests/analytics-routes.test.ts` exercises real file-repository transactions and signed demo sessions: anonymous/buyer rejection, two-creator isolation, rejected caller-selected tenants, private cache headers, strict input validation, source/device persistence, privacy opt-outs, bot exclusion, same-origin protection and protected block access.

The tests use synthetic fixtures. They do not prove that real Supabase, Stripe, Cal.com credentials or deployed provider webhooks are configured.
