# PAGER analytics, administration and discovery implementation plan

**Goal:** Give creators useful page analytics, operators a protected administration panel, and visitors and crawlers fast, understandable public pages.

**Architecture:** Extend the existing published-page projection and transaction store. Analytics remains first-party and tenant scoped; administration uses a server-controlled identity allowlist. Server-render only anonymous-safe publication content, then recover authenticated capabilities through existing protected endpoints.

**Tech stack:** Existing TypeScript, Next.js App Router, React, Supabase, Drizzle and Vitest. No external analytics dependency or third-party tracking scripts.

**Spec:** `docs/SPEC.md` plus the user's 2026-09-03 request for analytics, admin and SEO/GEO/AEO with mobile as the primary surface.

## Constraints

- Preserve all 25 block types, Russian and English, and payment/access/inventory contracts.
- Never include protected content, customer records or credentials in public HTML, RSC, metadata, structured data or crawler files.
- Exclude demo/test/owner events from real business metrics and label demonstration results.
- No claims of guaranteed ranking, AI citations, live providers or deployed infrastructure.
- Agents own disjoint file sets; no commits or release requested.

## Parallel deliverables

- [x] Creator analytics: 7/30/90 day reports, daily traffic, sources/devices, block and paywall interactions, confirmed outcomes and money separated by currency. Tenant and abuse tests.
- [x] Administration: server-verified allowlist, read-only operational overview and safe creator summaries, no private bodies or customer PII. Authorization and projection tests.
- [x] Discovery: anonymous-safe server rendering, canonical/social metadata, truthful structured data, robots/sitemap, protected item handling, connected booking CTA. Leakage and indexing tests.
- [x] Integration: direct mobile analytics navigation, desktop links, author search-readiness guidance, admin access entry and private-route indexing headers.
- [x] Verification: current full suite is **270 tests in 32 files**, with lint, typecheck, production build and diff check green. Independent review fixes integrated; deployment/provider gates recorded in `docs/ANALYTICS-ADMIN-VERIFICATION.md`.
- [x] HTTP and browser verification: fresh isolated loopback run completed on 2026-09-04 — discovery/admin analytics **43 checks**, API confidentiality/access/inventory/booking smoke **69 assertions**, plus current CUA review of public page and creator workspace. Live providers remain a separate gate.

## UI decisions

Keep PAGER's existing paper, ink and terracotta design tokens. Make analytics directly reachable in the bottom navigation. Reports favor readable numbers, accessible daily charts and concrete explanations of counting rules. Search-readiness guidance shows editable publication content and actionable checks, never an invented SEO score. Administration is a separate surface accessible only when the server grants capability.

## Source review

Use official Google Search guidance, OpenAI crawler documentation and public analytics repositories as references. Record URLs and what was adopted in feature documentation; do not copy licensed application code or add dependencies merely because a source exists.
