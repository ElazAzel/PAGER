# PAGER integrations and commerce backend

Implemented in the integration agent's file set only. Shared entities come from `src/lib/types.ts`; optional persisted `commerce`/`delivery` metadata is narrowed in integration modules. The core store must preserve these fields in its JSON payloads. All mutations use the core transactional store; Postgres advisory locking and the file repository lock serialize reservations, payment receipts, entitlements and booking versions.

## Modes and readiness

There are three distinct modes:

| Mode | Configuration | Actual external calls | Metrics |
| --- | --- | --- | --- |
| Explicit local demonstration | `PAGER_DEMO=true`, loopback host, separate `.data/pager-demo` data | None: Stripe/Cal/Inngest endpoints reject provider operations; notification records are labelled unsent demo records | `test=true`, excluded |
| Stripe Sandbox with real persistence | `PAGER_DEMO=false`, real core DB/auth, Stripe test credentials, `PAGER_STRIPE_LIVE=false` | Real Stripe Sandbox API and signed webhooks, never simulated payments | `Order.test=false`, `Order.commerce.sandbox=true`, opportunity `test=true`; exclude sandbox orders from revenue |
| Production | `PAGER_DEMO=false`, real core DB/auth, live approved provider accounts, `PAGER_STRIPE_LIVE=true` | Real providers | Include only genuine non-test conversions |

The browser cannot choose the mode, account, buyer, amount or provider event. The order freezes the server-side offer and shipping quote. Only USD/EUR/GBP are accepted by this MVP: all amounts are integer cents/pence. A redirect never grants access.

No live provider verification has been performed without credentials. Passing unit/transaction tests is not proof of an approved Connect account, approved Cal OAuth client, working SMTP/domain, a registered Inngest deployment, or a production database migration.

## Environment to merge into the coordinator's example

Do not put actual values in chat, Git, public environment variables or client code.

```dotenv
# Absolute trusted HTTPS origin, no user-controlled Host-derived callback URLs.
# In explicit local demo, http://127.0.0.1:3000 is permitted.
PAGER_APP_URL=https://your-pager-domain.example

# Exactly 32 random bytes, base64 encoded, for AES-256-GCM encryption.
# Keep this stable and backed up. Rotation requires decrypt/re-encrypt migration.
PAGER_INTEGRATION_KEY=

# Stripe Connect, standard account OAuth and direct charges.
STRIPE_SECRET_KEY=
STRIPE_CONNECT_CLIENT_ID=
STRIPE_WEBHOOK_SECRET=
PAGER_STRIPE_LIVE=false

# Optional primary Cal OAuth; approval is required. API key fallback needs no OAuth env.
CAL_OAUTH_CLIENT_ID=
CAL_OAUTH_CLIENT_SECRET=

# Off by default. All four provider fields are required for actual notification delivery.
PAGER_NOTIFICATIONS_ENABLED=false
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
RESEND_API_KEY=
RESEND_FROM=PAGER <bookings@your-verified-domain.example>

# Optional recipient Telegram channel, independent of Resend readiness. Off by default.
PAGER_TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
# Exact BotFather username, without @ (5-32 ASCII letters/digits/underscores).
TELEGRAM_BOT_USERNAME=
# A separate random 32-256 character A-Z/a-z/0-9/_/- secret for setWebhook.
TELEGRAM_WEBHOOK_SECRET=
```

Core-managed requirements remain separate: `PAGER_DEMO`, the demo session secret/data directory, Supabase Auth/Storage settings, `DATABASE_URL`, migrations and RLS. Do not point demo storage at production exports. Use separate Supabase projects/Stripe keys for Sandbox and production. Sandbox is not automatically selected if credentials are missing; providers fail closed.

To generate an encryption key locally, use `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"` and paste it directly into the local environment. Never publish the output. Credentials are encrypted with owner- and purpose-bound AEAD associated data. API responses never return keys, access/refresh tokens, webhook secrets or OAuth state records.

## Stripe setup and behavior

1. Configure a Stripe Connect platform with Standard-account OAuth. Register `PAGER_APP_URL/api/integrations/stripe/callback` as the exact redirect URI, and use the client ID for the selected Stripe mode.
2. An authenticated creator calls `POST /api/integrations/stripe/connect`. The callback requires the same authenticated creator and a ten-minute, owner/provider-bound, single-use nonce. Credentials are exchanged on the server. Reusing another creator's connected account is rejected. Switching an account with existing orders requires manual migration.
3. `POST /api/integrations/stripe/refresh` checks current `charges_enabled` and `payouts_enabled`. Merely saving an account ID does not make commerce ready.
4. Register `POST /api/webhooks/stripe` to receive connected-account events, and configure the correct signing secret. Subscribe to `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, and `account.updated`.
5. Match the webhook API version to the installed Stripe SDK's default version; the adapter handles both legacy invoice subscription/payment-intent fields and newer invoice parent/payment collections. Unsupported multi-line, split-payment, prorated, discounted or externally altered invoices fail reconciliation instead of granting ambiguous access. These are outside the single-offer MVP.
6. Use card payments only. Checkout requests are sent with `stripeAccount: order.stripeAccountId`, without destination transfers. PaymentIntent application fee is zero; subscription application fee percentage is zero. Stripe's own processing fees still apply.

`POST /api/checkout` requires a verified buyer session, same-origin mutation and accessible published resource. It validates server price, quantity, shipping country/address, creator readiness and resource ownership. Access quantities are one; services must reference the buyer's confirmed booking. Digital goods cannot be repurchased while owned; physical goods/tickets remain repeatable purchases. Buying page/block access never purchases contained items. A whole-page gate must be satisfied before purchasing an inner block/item.

Inventory is reserved atomically with the pending order. Duplicate checkout requests reuse the order and the Stripe idempotency key. A different mode for the same pending access purchase is rejected. A reservation expires with Checkout, and payment/failure/expiry replays cannot decrement or release it twice. Refunds do **not** automatically restock physical goods: a refund is not proof the item was returned. Late payment after a released reservation cannot consume another buyer's reserved stock; its grant is revoked, its payment remains recorded and the reconciler requests a refund.

Signed webhook handling verifies the raw bytes, a 300-second signature tolerance, expected live/test mode, connected account, order/session identity, currency and total. Current Stripe objects are fetched in the connected-account scope. A durable provider/account/event receipt is committed in the same transaction as transitions. A payment ID gets one grant even if several event types report it. Partial refunds preserve access; the monotonic cumulative full-refund amount revokes only the matching payment's grant. Disputes suspend that payment's grant; won disputes restore it unless refunded; lost disputes revoke it. Independent grants remain valid.

Monthly Checkout completion only grants access through a verified paid invoice and its actual period. Each invoice payment has its own grant/expiry. Late invoices cannot shorten a newer paid period; refunding one period does not revoke another payment. Cancel at period end preserves paid-through access. `POST /api/subscriptions/[id]/cancel` is buyer-only. `POST /api/orders/[id]/refund` is creator-owner-only and refunds the remaining balances of the order's recorded payments; `refundRequested=true` is not a confirmed refund. The refund webhook owns revocation. Cancelling a subscription or booking does not imply a refund, and refunding an access order does not implicitly cancel recurring billing.

The Inngest maintenance function runs every five minutes. It checks expired pending sessions against Stripe, expires still-open sessions and releases only confirmed-expired reservations. It recovers an interrupted session creation by scanning the connected account for the order metadata, up to 1,000 recent sessions; only a completed scan with no session and a passed grace period can release a never-created checkout. A failed/incomplete provider check preserves stock and records `commerce.checkoutError`. It does not create a replacement payment or extend an expired quote. Paid sessions still require a signed webhook; replay the provider event from Stripe if delivery was lost. A provider outage can therefore hold stock temporarily rather than oversell it.

Source: [Stripe direct charges](https://docs.stripe.com/connect/direct-charges), [subscription webhook behavior](https://docs.stripe.com/billing/subscriptions/webhooks), [invoice payment linkage](https://docs.stripe.com/api/invoice-payment/object).

## Local demo API

The core demo session endpoint establishes a signed HttpOnly buyer/creator session. Every checkout/booking mutation uses that identity, same-origin checking and a loopback guard. Reverse-proxied public requests cannot operate the demo.

- `POST /api/checkout` returns `{url:'/checkout/<id>',orderId,demo:true,provider:'local_demo',notice:...}`.
- `GET /api/checkout/[id]` returns only the authenticated buyer's order; guessing another order ID returns 404.
- `POST /api/checkout/[id] {action:'pay'|'cancel'}` runs the same commerce transitions as provider events, only for explicit local-demo orders. It does not invoke Stripe. Expired sessions cannot be paid; duplicate actions are safe.
- `POST /api/bookings` creates a one-hour local demo slot after validating block access, verified buyer email and overlapping bookings. This is not Cal availability. It commits the booking before trying to create an associated service order, so a payment setup failure does not undo the booking.
- Demo cancellation/reschedule updates the same version transition and notification outbox used for provider bookings. Demo notices remain explicitly labelled unsent records. No email/calendar invitation is sent.

Checkout/booking response fields supplement the shared HTTP contract; the coordinator owns the UI that renders the demo notice and total. Integration APIs work independently of UI implementation.

## Cal setup and behavior

Primary OAuth: create an approved Cal OAuth client and register `PAGER_APP_URL/api/integrations/cal/callback`. `POST /api/integrations/cal/oauth` requests `PROFILE_READ BOOKING_READ BOOKING_WRITE WEBHOOK_READ WEBHOOK_WRITE EVENT_TYPE_READ`. The callback consumes an authenticated owner-bound nonce, exchanges the code, encrypts rotating access/refresh tokens, and registers the owner webhook. Token refresh is serialized by the core transaction so concurrent workers cannot consume one refresh token twice. OAuth approval is external; it is not simulated.

Fallback: an authenticated creator sends `{apiKey,calLink}` to `POST /api/integrations/cal`. The key is verified through Cal's `/v2/me`, then encrypted. A Cal link must be `https://cal.com/creator/event`. Updating credentials replaces the chosen auth method. Saving a string does not count as a successful provider connection.

The backend creates or updates an owner webhook at `PAGER_APP_URL/api/webhooks/cal/<ownerId>` with a random encrypted per-owner secret and `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED` triggers. It uses the default `2021-10-20` webhook payload shape (no custom template) and `2026-02-25` booking API header. Re-registration first looks for the same subscriber URL to recover an interrupted write. Provider failure is returned; it is never reported as connected.

Set a numeric Cal `eventTypeId` on a published booking block and/or its linked `service` item. Each Cal event type must map to exactly one visible published booking block for that creator. Do not configure Cal's own payment requirement: this flow books first, then pays through PAGER. Configure event types for immediate acceptance; requested/unconfirmed bookings are not imported as confirmed. A user must have access to a gated block. For external Cal embeds, use the same email that the buyer verifies in PAGER.

`POST /api/bookings` in real mode returns 409 with `provider:'cal'` and the validated booking URL; it never invents a Cal booking. The UI opens/embeds Cal. Only the signed Cal webhook imports a confirmed booking. Raw-body HMAC is compared in constant time. Since Cal does not supply a Stripe-style signed delivery timestamp header, the handler also fetches the current booking with the creator credential and follows bounded reschedule aliases; durable receipts and provider timestamps prevent stale replay from resurrecting cancelled bookings. Caller-controlled metadata cannot change owner, item or buyer IDs.

The attendee's normalized email is matched within the creator's CRM. Existing verified PAGER users are linked to their booking. For registration after booking, `claimBuyerBookings(user)` in `src/lib/integrations/booking-claims.ts` transactionally claims unassigned bookings using the server-verified user's email and a tenant-matching contact; already assigned bookings and another data mode cannot be claimed. The core `GET /api/purchases` already calls this helper after authentication and before projecting the library; the real-mode handler test verifies that hook. The helper also prepares missing orders for confirmed priced services, in separate transactions: payment readiness failure cannot hide or cancel the booking. A service order is also prepared immediately after webhook confirmation when a known buyer exists; it shares the booking opportunity so booking/payment count once. Payment failure never automatically cancels the Cal booking.

`POST /api/bookings/[id]/cancel` and `PATCH /api/bookings/[id]` authorize creator owner or verified buyer before using the creator's Cal credentials. They request the provider operation and return `providerUpdatePending:true`; signed webhooks confirm the new state. Cal controls actual duration/timezone. Local cancellation does not claim success before provider confirmation. On reschedule, old UID aliases and booking versions suppress stale cancellation/reminder events. API time fields are UTC ISO strings; email rendering uses the buyer's IANA timezone.

Source: [Cal OAuth approval and scopes](https://cal.com/docs/api-reference/v2/oauth), [webhook payload/security](https://cal.com/docs/developing/guides/automation/webhooks), [webhook registration](https://cal.com/docs/api-reference/v2/webhooks/create-a-webhook), [reschedule API](https://cal.com/docs/api-reference/v2/bookings/reschedule-a-booking).

## Inngest and Resend

Deploy/register `GET/POST/PUT /api/inngest` with Inngest and set its signing key/event key. The endpoint is disabled in demo or without a signing key; unsigned requests are handled by the official Inngest signature verification. The functions are `booking-notification` and `commerce-reconciliation`.

Set up a verified Resend sender/domain, then explicitly set `PAGER_NOTIFICATIONS_ENABLED=true`. Enable only after checking sender delivery and the Inngest production deployment. Review Cal's own confirmation/workflow settings so the creator does not enable duplicate custom reminder emails externally.

The booking transaction inserts deterministic version-specific outbox records. Immediate dispatch starts one Inngest job per notification; the five-minute maintenance scan recovers unsubmitted records if dispatch or the process failed. A scheduled job sleeps until 24 hours before the booking. If that moment has already passed at booking/reschedule time, no reminder is queued. Delivery rereads the current booking/version and suppresses cancelled/rescheduled/stale reminders. The version check and external send hold the store transaction, preventing a cancellation from racing between check and send; this prioritizes correctness but can temporarily serialize unrelated mutations during a slow provider call.

Resend receives the notification ID as its idempotency key. A provider failure persists a failed notice and an analytics failure, then throws for Inngest retries. After 23 hours from an uncertain first attempt, automatic sending stops for manual provider reconciliation rather than risk duplication beyond Resend's idempotency window. Exhausted jobs can be retried from Inngest after investigating their durable outbox error. `sent` means Resend accepted the message, not guaranteed inbox delivery. RU/EN confirmation, reminder and cancellation text is implemented. Missing credentials leave visible pending records; they never become falsely sent.

## Optional recipient Telegram

Telegram is an additional booking-notification channel for the recipient's own verified PAGER account. It never replaces Resend, imports messages, or manages membership in external groups/channels. The legacy creator `Integration.telegramChatId` field is ignored for delivery. Buyer and creator accounts can pair their own recipient identity; a creator cannot select Telegram delivery for a customer's email or choose the customer's chat.

Configure a BotFather bot and set `PAGER_TELEGRAM_ENABLED=true`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (without `@`), `TELEGRAM_WEBHOOK_SECRET`, and the existing stable `PAGER_INTEGRATION_KEY`. The token must have the Telegram `<numeric-bot-id>:<secret>` shape. The webhook secret must be a separate 32-256 character random string using only `A-Z`, `a-z`, `0-9`, `_`, `-`. Actual sending also requires the existing primary `PAGER_NOTIFICATIONS_ENABLED=true`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `RESEND_API_KEY`, and `RESEND_FROM`. Missing Telegram settings do not change `notificationsReady()` or prevent email acceptance. Demo mode never pairs or sends.

Register the bot once through Telegram's `setWebhook` API, with the following body (substitute deployment values privately):

```json
{
  "url": "https://your-pager-domain.example/api/webhooks/telegram",
  "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
  "allowed_updates": ["message"]
}
```

The endpoint is `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook`. Keep this credential-bearing URL out of logs, screenshots and Git. Registration is an operator deployment step; it has not been executed in this credentials-free implementation. Check `getMe` for the matching username and `getWebhookInfo` for the registered URL/errors during provider certification. Changing to another bot ID requires recipient re-pairing; rotating the same bot's token preserves the bot identity.

Settings API, all responses `Cache-Control: private, no-store`:

| Method and path | Request | Success response |
| --- | --- | --- |
| `GET /api/integrations/telegram` | Authenticated session | `{configured:boolean,connected:boolean}` |
| `POST /api/integrations/telegram` | Same-origin authenticated session, strict JSON `{}` | `{url:string,expiresAt:string}` |
| `DELETE /api/integrations/telegram` | Same-origin authenticated session | `{connected:false}` |
| `POST /api/webhooks/telegram` | Telegram update JSON and exact `X-Telegram-Bot-Api-Secret-Token` header | `{received:true}` |

`configured` means explicit enabled flag, real mode, and locally valid bot token/username/webhook/encryption settings. It is **not** proof of successful Telegram registration or delivery. `connected` additionally requires a consumed `/start` pair for this verified user's current normalized email and the currently configured bot ID. The exported server helper `telegramStatus(state,user)` returns this exact two-boolean shape. Coordinator/Cicero dashboard wiring uses `telegramStatus(state,user).connected` for the existing `dashboard.integration.telegramConnected`; the settings UI reads `configured` from GET. Do not derive readiness from legacy `telegramChatId` or from merely issuing a pair URL. No shared type change is required.

POST creates a random 256-bit base64url link `https://t.me/<username>?start=<opaque-token>` valid for ten minutes. Only its SHA-256 hash is persisted, bound to the session user ID, current normalized email and bot ID. Issuing a new link invalidates the previous pending token. Treat the returned URL as a one-time credential; show/open it only for the authenticated recipient, never copy it into analytics or logs. After the recipient presses Start in the bot's private chat, the webhook atomically consumes the token and encrypts the chat ID with recipient/connection-bound AES-GCM. It requires a non-bot sender whose ID matches the positive private chat ID. Group/channel messages, edited messages, wrong-bot commands, expired/replaced/replayed tokens, changed email identities and forged sender IDs cannot bind a recipient. Webhook secret checking is constant-time and happens before parsing/mutation. Unknown tokens and unsupported updates receive the same generic acknowledgement; malformed JSON gets 400 and a bad webhook secret gets 401. No webhook response sends a bot message.

Settings only report booleans and the newly minted link/expiry. Caller-supplied `chatId`, email and user ID are rejected. Recipient connection metadata is stored in the existing server-side `integrations` JSON payload under that recipient's `ownerId`, including for buyer accounts; no new DB table is needed. DELETE removes the current connection and pending token even when delivery settings are disabled. Disconnecting one recipient does not alter another recipient's integration. Re-pairing replaces the connection ID and invalidates queued delivery to the old connection.

New booking-version notices snapshot the recipient's existing opt-in connection. Existing queued notices do not acquire Telegram retroactively after pairing. Confirmation, 24h reminder and cancellation messages reuse the same RU/EN/timezone text as email, use plain text, and disable link previews. At delivery, the current booking version, status, recipient's verified identity and exact connection ID are checked again. Cancellation/reschedule, disconnect, changed email, or re-pairing suppress stale Telegram delivery. The existing under-24h reminder rule is preserved.

Email retains `Notification.status`, `Notification.error` and `delivery.providerId`; Telegram has its own `delivery.telegram` record with `recipientId`, `connectionId`, `status`, optional `attemptId`, `providerId`, `retryAt` and sanitized `error`. Telegram statuses are `pending`, `sent`, `failed`, `unknown`, `suppressed`. `sent` means Bot API accepted the message, not that a person read it. Optional errors never overwrite a sent email result, and Inngest retries skip already accepted channels. A definite Telegram 4xx rejection is retryable after repair; 429 respects `retry_after`. Missing bot configuration records a Telegram-only failure; Resend acceptance and booking confirmation remain intact. Failures are recorded as deduplicated `notification_failed` analytics events per channel.

Telegram `sendMessage` has no idempotency parameter. Before sending, the store commits an `unknown` outcome marker, then holds the transaction through current-version/consent checks and the request. A confirmed response records the message ID. Timeout, lost/invalid response, or process failure after provider acceptance leaves an honest `unknown` outcome: automatic retries never send again. Inspect provider/recipient evidence and reconcile the specific outbox record before manually allowing another attempt; there is no public reset/resend endpoint. Definite failures can be retried through the existing Inngest function. Raw provider descriptions, token-bearing request URLs, chat IDs and caught network exceptions are never copied into delivery errors or HTTP errors.

Sources: [Telegram deep links](https://core.telegram.org/bots/features#deep-linking), [webhook secret authentication](https://core.telegram.org/bots/api#setwebhook), [sendMessage](https://core.telegram.org/bots/api#sendmessage).

## Verification and remaining production checks

Integration tests cover payment event replay, amount/account/currency/mode rejection, full/partial refunds, dispute ordering, invoice ordering, paid-through cancellation, last-unit reservations through independent real file repositories, duplicate stock notifications, scoped buyer order ownership, gated item/shipping validation, demo guards, AES-GCM credential binding, single-use OAuth state, Stripe and Cal signatures, booking ownership/versioning, notification deduplication and under-24-hour scheduling. Scoped continuation tests exercise atomic Telegram token consumption through two file repositories, authenticated route contracts, private-chat-only pairing, separate Resend/Telegram errors and retries, secret redaction, opt-out/version suppression, and uncertain send outcomes. The signed Cal route tests verify a known-email attendee cannot be reassigned via metadata, a failed paid-order transaction leaves the confirmed booking/outbox committed, and the existing authenticated purchases hook claims a pre-registration booking without replacing another buyer. The Sandbox metrics exclusion remains in core `metrics.ts` and `Order.commerce.sandbox` is preserved.

Run integration tests by explicit filenames or `pnpm exec vitest run tests/integrations` (Vitest filters by path). Run `pnpm exec tsc --noEmit`, lint, and `pnpm build` on the final integrated tree. Do not use `pnpm test -- ...` to assume filtering without checking the actual runner arguments.

Before claiming live readiness, exercise a real test-mode connected creator with Checkout, invoice renewal, duplicate/out-of-order signed events, refund/dispute, disconnected-account behavior, expired and interrupted sessions, and a concurrent last-unit sale. Exercise an approved Cal account's create/reschedule/cancel webhook, token refresh, less-than-24h reminder suppression, Resend delivery and Inngest retry/replay. Validate the core normalized Postgres transaction/RLS implementation independently with two creators/two buyers. Stripe CLI testing should forward **connected-account** events and use a secure integration origin (an HTTPS development tunnel is acceptable with real mode; never expose local demo through it).

External credentials, Cal client approval, provider registrations, verified sender, HTTPS deployment, and live Postgres/RLS certification remain deployment inputs, not simulated completed work.

### Continuation handoff — 2026-09-03

Telegram recipient opt-in and independent delivery are implemented. Final scoped run: `pnpm exec vitest run tests/integrations` **60 passed in 9 files**, including **24 Telegram tests** and **5 signed-Cal/claim flow tests**. `pnpm exec tsc --noEmit` and scoped ESLint passed. Injected provider descriptions and network exceptions containing the actual test bot token, Telegram URL and chat ID do not appear in persisted or thrown delivery errors. All provider requests in these tests were mocked; no external messages or registration calls were made.

Coordinator-reported final checks: full suite **109 passed in 17 files**, fresh typecheck/lint passed, and production build passed. Earlier fresh local-demo HTTP smoke passed **63 assertions**, including book-first, reschedule, payment and cancellation. A fresh production-build HTTP launch was blocked by automatic approval review without a detailed reason; it was not circumvented and that HTTP rerun is not claimed as passed. Core hidden-material handler tests are separate evidence, not a substitute claim of production HTTP certification.

Scoped continuation paths: `src/lib/integrations/telegram.ts`, `telegram-delivery.ts`, `model.ts`, `notification-queue.ts`, `notifications.ts`, `booking-claims.ts`; `src/app/api/integrations/telegram/route.ts`; `src/app/api/webhooks/telegram/route.ts`; `tests/integrations-telegram.test.ts`; `tests/integrations-cal-flow.test.ts`; this document. Coordinator merged the route contracts/env names and Cicero wired dashboard `telegramConnected` through the preserved `telegramStatus(state,user).connected` helper; those changes were verified by reading the integrated tree, not made by this integration agent. No frontend/package/core edits, subagents, commits or live integration claims were made in this continuation. Supabase CLI installation alone does not supply credentials or certify a deployed database.
