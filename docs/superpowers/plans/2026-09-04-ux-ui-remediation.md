# PAGER UX/UI Remediation Implementation Plan

> **Статус:** локальный implementation/remediation завершён 2026-09-04. Чекбоксы ниже отмечают доставленный результат и свежую проверку; они не являются ретроактивной расшифровкой каждого промежуточного failing-run. Внешние provider, deployment и full accessibility gates остаются отдельными.

**Goal:** Close the audited P0/P1 UX and UI defects so PAGER's visitor → booking → payment and creator → publish journeys have truthful, accessible, testable states.

**Architecture:** Keep the existing App Router and server-owned capability/access model. Normalize commerce results at the API/UI boundary, keep shipping data buyer-only, and make creator readiness a visible publish gate. Apply focused CSS and semantic improvements on top of the existing warm-paper design system.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Zod, Vitest, CSS modules, Radix Dialog.

**Spec:** docs/superpowers/specs/2026-09-04-ux-ui-remediation-design.md

## Global Constraints

- Product name is PAGER; do not reintroduce LinkMax in product copy.
- Preserve all 25 block types and Russian and English UI.
- Never expose private block content, creator credentials, customer data or entitlements to unauthorized callers.
- Keep the runnable local demonstration explicitly separate from real Supabase and Stripe integration mode.
- Do not claim simulated payments, emails or bookings are live integrations.
- Preserve the selected “Светлый профессиональный bento” direction: warm paper, expressive serif display type, restrained UI text, edge-to-edge public pages, no generic blue SaaS styling or glow gradients.
- Public mobile surfaces are primary at 320–414 px; interactive targets should be at least 44 px.
- Every behavior change requires a failing test before production code and fresh verification before completion.

---

### Task 1: Normalize booking/payment and offer selection

**Files:**
- Modify: src/app/api/bookings/route.ts
- Modify: src/app/ui/booking-picker.tsx
- Modify: src/app/ui/public-page.tsx
- Modify: src/app/ui/block-renderer.tsx
- Modify: src/lib/types.ts
- Test: tests/pilot-booking.test.ts, tests/integrations-checkout.test.ts

**Interfaces:**
- BookingPicker emits onBooked(result: { booking: Booking; orderId?: string; paymentError?: string; bookingUrl?: string }).
- BlockRenderer calls onBuyBlock(block, mode) where mode is "one_time" | "monthly".
- The API continues to return orderId only when a payment order is created; free/pilot booking remains a confirmed booking with an explicit no-checkout state.

- [x] Add the provider-boundary regression asserting that a confirmed booking preserves `orderId` in the UI result contract.
- [x] Run the focused booking/commerce tests and verify the normalized result contract.
- [x] Add the typed booking result, forward `orderId`/`paymentError`/`bookingUrl`, and route confirmed paid bookings to `/checkout/:id` before the final success toast.
- [x] Add the offer regression and keep displayed billing mode/amount aligned with checkout input.
- [x] Render explicit one-time/monthly offer buttons and pass the selected mode into `/api/checkout`; one-price blocks remain a single button.
- [x] Run the focused files and the full suite.

### Task 2: Make physical checkout and buyer states truthful

**Files:**
- Modify: src/app/ui/public-page.tsx
- Modify: src/app/ui/buyer-pages.tsx
- Modify: src/app/ui/block-renderer.tsx
- Modify: src/lib/i18n.ts
- Test: tests/integrations-checkout.test.ts, tests/commerce-ui-contracts.test.ts.

**Interfaces:**
- Shipping form submits Order["shippingAddress"] and selected country only after local required-field validation.
- A purchased digital item renders an authorized open action only when its projected fileId is present; no file ID is fabricated.

- [x] Add the checkout regression for missing address/allowed shipping country and run the focused checkout test.
- [x] Add shipping forms for physical purchases from public catalog and item detail, using only `item.shipping` countries and passing the address to checkout.
- [x] Add localized shipping, digital delivery, expired-order and retry/recovery states; hide Pay/Cancel for terminal statuses.
- [x] Add a safe Open material/delivery action only for authorized digital items with a projected `fileId`.
- [x] Preserve original page/item return paths and buyer locale; show booking timezone beside formatted time.
- [x] Run the focused commerce tests and the full suite.

### Task 3: Repair local demo and error boundaries

**Files:**
- Modify: src/lib/server/demo.ts
- Modify: src/app/ui/public-page.tsx
- Modify: src/app/ui/pager-shell.tsx
- Modify: src/app/ui/buyer-pages.tsx
- Modify: src/app/layout.tsx
- Modify: src/lib/i18n.ts
- Test: tests/core-auth.test.ts, tests/core-routes.test.ts.

**Interfaces:**
- Demo is enabled only from server-owned capabilities; real mode never renders a demo action.
- Loopback acceptance allows only loopback URL/Host plus a matching same-origin loopback Origin, while forwarded external requests remain rejected.
- Client errors use localized fallbacks and never expose raw proxy/English transport text as the primary Russian copy.

- [x] Add demo-guard regressions for same-origin loopback, proxy markers and mismatched origins in the focused auth tests.
- [x] Implement the narrow same-origin loopback rule without weakening real-mode behavior or forwarded-host checks.
- [x] Make AuthModal, DemoGate and public actions capability-aware; add `role="alert"`/`aria-live` to expected error states and retry actions.
- [x] Derive document language from the active route/page locale where possible and localize modal close/media labels.
- [x] Run focused auth/route tests and repeat the local browser demo path on a fresh data directory.

### Task 4: Make creator publish, integrations, and catalog actionable

**Files:**
- Modify: src/app/ui/pager-shell.tsx
- Modify: src/app/ui/page-editor.tsx
- Modify: src/app/ui/page-readiness.tsx
- Modify: src/lib/server/pages.ts
- Modify: src/app/ui/appearance-controls.tsx
- Test: tests/readiness.test.ts, tests/editor-draft.test.ts, tests/page-publish-readiness.test.ts.

**Interfaces:**
- Publish UI receives the same readiness result used by Settings and blocks only unmet required checks with an explanation.
- TopBar status is derived from page.publishedAt, not from demo/real mode alone.
- Stripe and catalog setup controls expose actionable setup states without calling external providers in demo mode.

- [x] Add readiness/publish regressions for missing required content and truthful unpublished status (`tests/readiness.test.ts`, `tests/page-publish-readiness.test.ts`, `tests/editor-draft.test.ts`).
- [x] Place readiness summary beside the publish action, pass it through the editor, and keep server validation as the final authority.
- [x] Fix TopBar status, add Stripe Connect setup CTA/status explanation, and gate paid controls on payment capability/account readiness.
- [x] Expand catalog create/edit flow for description, digital file reference, service link/event type, stock and shipping countries with server ownership validation.
- [x] Add slug guidance and distinguish retryable dashboard load errors from onboarding.
- [x] Run focused creator tests and the full suite.

### Task 5: Finish accessibility and visual-system cleanup

**Files:**
- Modify: src/app/ui/public-page.tsx
- Modify: src/app/ui/pager-shell.tsx
- Modify: src/app/ui/buyer-pages.tsx
- Modify: src/app/ui/block-renderer.tsx
- Modify: src/app/globals.css
- Modify: src/app/ui/public-conversion.module.css
- Modify: src/app/ui/page-readiness.module.css
- Modify: src/app/ui/pager-icon.tsx
- Test: tests/appearance.test.ts, tests/appearance-render.test.ts, tests/platform-appearance.test.ts, and browser verification.

- [x] Add pure accessibility/appearance assertions for target-size, contrast-sensitive tokens and media descriptions.
- [x] Give public/catalog dialogs focus-safe Escape, backdrop close, focus restore, localized close names and alert/error association.
- [x] Add main landmarks, meaningful loading/status roles, tab/segmented-control state, labels for repeated creator controls and informative gallery/before-after alt text.
- [x] Fix desktop item-card sizing, sticky dock safe area/overlap, mobile active-nav contrast and interactive control sizing while preserving warm-paper tokens.
- [x] Register `Clock3` and make video/map/shoutout states honest when no usable media/link exists.
- [x] Run focused appearance tests and browser checks, including keyboard/reduced-motion coverage documented in the visual audit.

### Final verification

- [x] Run `pnpm test`: 270 tests in 32 files passed.
- [x] Run `pnpm lint`: exit 0.
- [x] Run `pnpm typecheck`: exit 0; source and generated types are current after the clean build.
- [x] Run `pnpm build`: exit 0; external integration blockers remain release gates.
- [x] Run `git diff --check`: pass.
- [x] Re-run the local demo, public booking/purchase/shipping/expired states, creator publish path, dialog keyboard behavior and responsive/overflow checks; record the fresh isolated HTTP and CUA evidence in the audits.
