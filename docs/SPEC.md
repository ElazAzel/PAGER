# PAGER MVP — accepted specification

Approved by the user on 2026-09-02. Implement a working modular Next.js 16 / React 19 / TypeScript monolith with Supabase Postgres/Auth/Storage, Drizzle, Tailwind/shadcn, Tiptap, dnd-kit, Stripe Connect/Checkout/Billing, Cal.com v2, Resend, Inngest and Vercel.

## Product

First audience: independent consultants/coaches selling 1:1 time. RU/EN UI and system emails. Light professional bento design. First 10 creators pay no PAGER subscription or commission, no mandatory branding. One page per creator for pilot.

2026-09-03 user correction: mobile is the primary surface. The original three desktop mockups were rejected. Design the editor and creator workspace as a polished mobile application with touch-sized controls, bottom navigation, focused screens and contextual sheets. Desktop adapts the same product language. Keep the approved Next.js web stack; this is an app-like mobile web/PWA experience, not a separate native rewrite. New mobile concepts replace the rejected selection set.

User repository: https://github.com/ElazAzel/PAGER (private, initially empty; connected as origin on 2026-09-03).

Editor: block list, live canvas, properties, mobile drawer; drag reorder, half/full width, duplicate, hide, archive, autosave draft, explicit atomic publish. Public /{slug} sees only last publication. Product detail /{slug}/items/{id} applies the originating block access policy. Main CTA is booking.

25 types: profile,text,image,separator,link,socials,video,carousel,before_after,testimonial,faq,map,messenger,download,pricing,catalog,product,countdown,scratch,shoutout,community,event,custom_code,form,booking.

Profile has name/profession/photo/linked rich description. Text supports inline formatting/links. Image supports GIF. Socials support built-in/uploaded icons. Video/portfolio galleries/before-after/testimonials/FAQ/map function per name. Pricing/catalog/product share items and open detail pages. Countdown expires gracefully. Scratch reveals a creator-set bonus. Shoutout links to another PAGER page. Community presents invitation (does not control external Telegram membership). Event includes registration, tickets and attendee list. Custom HTML/JS executes in sandbox iframe without parent-session access.

## Access and money

Any block or the whole page can be sold one-time or monthly. Buyer verifies email OTP before checkout. Cross-device purchase library. Anonymous users get author-supplied teaser/price only; no protected bodies/assets/code in HTML/RSC/API/metadata/cache. Authorization must be server-side, tenant isolated, with RLS. Owner preview is authenticated. Short-lived file grants.

Page entitlement unlocks all gated blocks including future additions; individual entitlement opens only that block. One-time survives price changes. Monthly access lasts to paid-through. Cancel at period end preserves paid time. Full refund revokes its entitlement; dispute suspends it; independent valid grants remain effective. Sold blocks archived not destroyed. Purchasing access never implicitly buys products/services/tickets inside. Do not repurchase an already owned resource.

Use Stripe Connect direct charges on creator accounts with 0 PAGER application fee. Checkout creates pending order using server-side price, identity and connected account. Only verified, replay-safe provider events grant access or confirm payment. Subscriptions update paid-through from paid invoices; support out-of-order events safely. Distinguish payment/fulfillment/refund states. A local demo must be labelled, loopback-only and use separate data, never presented as actual Stripe.

Catalog supports service,digital,physical,ticket. Single item per checkout with quantity; variants separate products. Physical inventory reservation is atomic, tied to expiry of checkout, released once on expiry/failure. Confirm stock only on paid event; handle duplicate webhook. Creator configures allowed shipping countries and fixed fees, buyer sees total before payment. Address recorded; creator manually sets shipped/tracking. Digital files available after confirmed purchase.

## Booking and CRM

Cal.com OAuth primary (requires Cal approval); encrypted per-creator API key fallback. Event type linked to service. Book first, then pay associated order. Pending payment never automatically cancels booking. Form/booking/order upsert tenant contact and opportunity. Contacts have notes and event timeline, CSV export. Match normalized email only within tenant. Anonymous forms rate limited.

Immediate confirmation and 24-hour reminder via Inngest+Resend; cancel/reschedule invalidates stale reminder. If less than 24h skip past reminder. UTC storage with user timezone display. Telegram optional after recipient starts bot and connects securely. Provider failure surfaced and retryable, not silently successful.

## Metrics

North Star: unique opportunities first converted by confirmed booking OR paid order in rolling week / published pages with >=1 non-owner visit that week. Booking plus its payment count once; renewal not new opportunity. Track activation within 24h, repeat contact conversions, payment/notification failures; exclude test/demo/owner events.

## Delivery

0 Install global skills and preserve URL/revision/license; source registry. Product Design three independent mockups, user chooses before UI implementation.
1 Page auth/editor/publication and basic six blocks.
2 Pricing,testimonial,faq,messenger,form,booking,CRM,notifications.
3 Access/subscriptions/catalog/download/product,inventory/shipping,purchase library.
4 All remaining types, analytics, acceptance verification.

Acceptance: two creators/two buyers isolation, direct URL/RSC/file leakage checks, repeated/out-of-order payment events, renewals/refunds/disputes, concurrent last-item purchase and expiry, booking cancellation/reschedule/timezones/under24h, mobile editor/GIF/richtext/customicons/keyboard/sandbox. Typecheck/lint/build and tests. Real integration status is reported honestly; no credentials fabricated. API keys go into local env, not chat or git. Teams/custom domains/PAGER pricing/shared cart/message import are later.

## Source installation

Global C:/Users/elaza/.codex/skills: public-apis reference index; Anthropic claude-code frontend-design; all anthropics/skills (namespace conflicts anthropic-); blader/humanizer; Vladimir-Human/humanizer-ru; Nutlope/hallmark. Local Open Design bridge to C:/Users/elaza/AppData/Local/Programs/Open Design/resources/open-design preserving installed application. Exact source metadata and update instructions kept in docs/sources*.
