# Fly Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the approved platform-audit defects and produce a locally verified GitHub-to-Fly.io release artifact without deploying it or storing secrets in Git.

**Architecture:** Keep validation in small shared pure helpers, keep server-owned capabilities/readiness authoritative, and leave external provider state at runtime. Build one Next.js standalone container, route Fly service checks through `/api/health`, and let one GitHub workflow deploy `main` only after the complete local/demo gate succeeds.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Vitest, Playwright Chromium, pnpm 11, Node.js 24, Docker, Fly Machines, GitHub Actions.

**Spec:** `docs/audits/2026-09-04-platform-release-audit.md`

**Execution status — 2026-09-05:** Implementation tasks 1–6 are present in the working tree. Fresh local typecheck/lint, 313 tests, standalone build, 26 browser scenarios, 43 discovery and 69 API assertions pass. The browser suite was added after component implementation, then exposed and verified a fixture correction; it was not run against the original baseline. Docker build/boot and authenticated Fly configuration validation remain external gates due to unavailable Docker Engine/WSL and Fly credentials. See `docs/RELEASE-VERIFICATION-2026-09-05.md` for executed checks and exact boundaries. The checkboxes below preserve the original plan, not the final execution record.

## Global Constraints

- Product name is PAGER; Russian and English are required.
- Preserve all 25 block types and the warm professional mobile-first visual system.
- Paid content, credentials, customer records, and entitlements remain server-projected and unauthorized callers never receive them.
- `PAGER_DEMO=true` remains loopback-only and must never be deployed publicly.
- Supabase migrations under `supabase/migrations` remain authoritative.
- Secrets are runtime values in Fly or GitHub environments, never committed or copied into build arguments.
- No production-ready claim without fresh typecheck, lint, full tests, production build, demo browser/API gates, Docker boot, and diff checks.

---

### Task 1: Safe login intent and creator enrollment

**Files:**
- Create: `src/lib/auth-intent.ts`
- Create: `src/app/login/login-screen.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/ui/public-page.tsx`
- Modify: `src/lib/server/auth.ts`
- Modify: `src/app/api/auth/verify/route.ts`
- Modify: `src/app/ui/pager-shell.tsx`
- Test: `tests/auth-intent.test.ts`
- Test: `tests/appearance-render.test.ts`

**Interfaces:**
- Produces: `safeInternalReturnTo(value, fallback)`, `parseLoginRole(value)`, and `authPayload(email, locale, role)`.
- Preserves: `/admin/mfa` and item-detail return paths; buyer remains the default role; pilot enrollment stays invite-gated.

- [ ] Write table-driven failing tests for valid internal paths and malicious schemes, absolute/protocol-relative URLs, backslashes, controls, and encoded separators.
- [ ] Run `pnpm exec vitest run tests/auth-intent.test.ts` and confirm failure is caused by the missing helper.
- [ ] Implement the helper and use only its canonical output in post-OTP navigation.
- [ ] Add failing render/enrollment tests proving creator intent is sent and an uninvited pilot cannot self-promote.
- [ ] Carry role through OTP verification and run `pnpm exec vitest run tests/auth-intent.test.ts tests/appearance-render.test.ts tests/core-auth.test.ts`.

### Task 2: Fail-closed capability, readiness, and legal contract

**Files:**
- Create: `src/lib/legal.ts`
- Modify: `src/lib/server/capabilities.ts`
- Modify: `src/lib/server/readiness.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/terms/page.tsx`
- Modify: `.env.example`
- Test: `tests/readiness.test.ts`
- Test: `tests/capabilities.test.ts`
- Test: `tests/legal.test.ts`

**Interfaces:**
- Produces: explicit payment capability and a readiness `legal` check.
- Preserves: simulated demo commerce; real/pilot readiness exposes statuses but never secret values.

- [ ] Add failing tests showing absent `PAGER_PAYMENTS_ENABLED` disables real payments and enabled-but-unconfigured Stripe degrades readiness.
- [ ] Add failing tests for legal contact validation and configuration-aware payment terms.
- [ ] Implement explicit opt-in gates and provider status `disabled`/`missing`/`ready` semantics.
- [ ] Render bilingual legal pages without fake contact data and run `pnpm exec vitest run tests/readiness.test.ts tests/capabilities.test.ts tests/legal.test.ts`.

### Task 3: Booking day navigation and sandboxed custom JavaScript

**Files:**
- Create: `src/lib/booking-slots.ts`
- Modify: `src/app/ui/booking-picker.tsx`
- Modify: `src/app/ui/block-renderer.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/booking-slots.test.ts`
- Test: `tests/appearance-render.test.ts`

**Interfaces:**
- Produces: stable local-day slot groups and one selected-day panel.
- Preserves: custom script source only inside `sandbox="allow-scripts"`; rich text still passes through `safeHtml`.

- [ ] Add failing grouping tests across days and a render test requiring `aria-pressed` on a selected time.
- [ ] Implement day tabs, one-day slot rendering, a live selection summary, and remove the nested slot scroll.
- [ ] Add a failing iframe test that requires script preservation plus `sandbox="allow-scripts"`, no `allow-same-origin`, and `referrerpolicy="no-referrer"`.
- [ ] Pass raw custom-code HTML only to the isolated iframe and run `pnpm exec vitest run tests/booking-slots.test.ts tests/appearance-render.test.ts`.

### Task 4: RU/EN entry shell and installable app identity

**Files:**
- Create: `src/app/ui/locale-switch.tsx`
- Modify: `src/lib/platform-appearance.ts`
- Modify: `src/app/ui/platform-preferences.tsx`
- Modify: `src/app/ui/pager-shell.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/manifest.ts`
- Create: `public/pager-icon.svg`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`
- Create: `public/icon-maskable-512.png`
- Test: `tests/platform-locale.test.ts`
- Test: `tests/appearance-render.test.ts`

**Interfaces:**
- Produces: deliberate locale persistence in `pager_locale`; active-screen synchronization of `document.documentElement.lang`.
- Preserves: a page author controls public-page language; viewing a page does not silently overwrite a visitor preference.

- [ ] Add failing locale-store/render tests for RU/EN landing and creator login copy.
- [ ] Implement the compact RU/EN switch and document-language synchronization.
- [ ] Add manifest icon assertions, create the deterministic PAGER mark, and rasterize exact 192/512 assets.
- [ ] Run `pnpm exec vitest run tests/platform-locale.test.ts tests/appearance-render.test.ts` and inspect the icon dimensions.

### Task 5: Automated release gates

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/release.spec.ts`
- Create: `scripts/demo-gate.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/verify.yml`

**Interfaces:**
- Produces: `pnpm test:e2e` and `pnpm test:demo-gate`.
- Consumes: the existing `test:api` and `test:discovery` scripts against one isolated loopback demo server.

- [ ] Write browser tests for creator intent, malicious buyer return fallback, booking day/slot state, and RU/EN document language.
- [ ] Run the focused browser suite before implementation and confirm the audited behaviors fail.
- [ ] Add Playwright configuration and a cross-platform isolated demo gate that waits on health without fixed sleeps.
- [ ] Add Chromium installation, demo gate, and `git diff --check` to CI; keep live-provider credentials out of pull requests.
- [ ] Run `pnpm test:demo-gate` and confirm API, discovery, and Chromium checks all complete against a fresh temporary data directory.

### Task 6: Fly.io production artifact and operator runbook

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `fly.toml`
- Create: `docs/FLY-DEPLOYMENT.md`
- Modify: `next.config.ts`
- Modify: `scripts/smoke-real.mjs`
- Modify: `docs/DEPLOYMENT-CHECKLIST.md`
- Modify: `docs/CI.md`
- Modify: `docs/VERIFICATION.md`

**Interfaces:**
- Produces: Next standalone `server.js` listening on `0.0.0.0:3000`, Fly service health checks at `/api/health`, and a deploy job using app-scoped `FLY_API_TOKEN`.
- Preserves: migrations are a deliberate pre-deploy gate; provider enablement remains an explicit runtime decision.

- [ ] Enable standalone output and build a non-root multi-stage Node.js 24 image with no env files in context.
- [ ] Add fail-closed Fly HTTP service configuration and a `main`-only, protected-environment deploy job that depends on verification.
- [ ] Document app creation, staged stdin secret import, migrations, GitHub environment variables, app-scoped deploy token, first deploy, rollback/status, and provider certification.
- [ ] Build the image, run it with isolated demo runtime values, and verify `/api/health`, `/`, and container non-root identity.
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:demo-gate`, and `git diff --check`; inspect the final diff and record any external gates as unverified.
