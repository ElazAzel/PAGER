# PAGER release artifact verification

Date: 2026-09-05. Branch: `feat/pager-mvp`. Baseline: `39aeb482729344eb1320b132078a9f61ea057e33`. Results apply to the uncommitted release-preparation changes in this checkout.

## Changes

- `returnTo` is parsed on the server and revalidated at the client navigation sink. Only normalized same-origin paths survive; unsafe input falls back to `/anna`. Checks cover script/data schemes, external and protocol-relative URLs, backslashes, encoded separators/controls, and paths that become `//` after dot-segment normalization. Buyers keep the previous `/dashboard` fallback; creators enter `/dashboard`.
- Creator intent is carried through both OTP calls. Omitted optional role in older verify requests retains the existing metadata enrollment behavior. Failed OTP cannot enroll; the pilot still requires a server-side invite.
- Real payments require explicit opt-in. Readiness reports `missing` for incomplete enabled integrations, and requires real operator contact. Legal text is bilingual and reflects whether payment is enabled; demo does not claim Stripe processing.
- Booking slots are grouped by visitor timezone/day. Day tabs and time buttons expose selected state. Custom-code scripts remain inside `sandbox="allow-scripts"` without `allow-same-origin`, with no referrer.
- Entry pages have RU/EN selection; explicit preference is stored in a cookie and active screen language updates the document. PWA manifest has 192/512 and maskable icons.
- Next standalone Dockerfile uses a non-root UID 1001. Docker context excludes env/data files. Fly configuration uses HTTPS, SIGTERM and `/api/health`; GitHub deployment requires passing quality and container jobs, an explicitly configured release branch, and explicit deployment enablement.

## Security finding outcome: fixed

The vulnerable path was `returnTo query → login callback → Next router navigation`. The enforcement boundary is now `safeInternalReturnTo` plus `postLoginDestination`, called at the page boundary and the navigation sink. Legitimate item paths, query/fragment values and `/admin/mfa` remain valid. This avoids depending on framework URL filtering and keeps the existing role destinations.

An independent read-only candidate review checked alternate parsers/encodings and found two compatibility regressions: buyer `/dashboard` navigation and omitted OTP role. Both were reproduced locally with failing tests, corrected, and covered by regression tests. A single review cycle was used.

Ordered evidence:

1. Source/caller/diff inspection and `pnpm typecheck`: passed. `pnpm lint`: passed.
2. `tests/auth-intent.test.ts` and `tests/auth-verify.test.ts`: 28 tests passed. The reported script/data/external/encoded inputs land on `/anna` in real Chromium navigation with a simulated OTP response; `window.__pagerInjected` is absent. The OTP provider itself is mocked in these tests.
3. The internal query+fragment control lands on `/terms?from=login#details`; creator intent reaches both OTP requests; pilot enrollment, failed OTP and older request contracts are tested. Full repository suite and production build passed.

Primary files: `src/lib/auth-intent.ts`, `src/app/login/page.tsx`, `src/app/login/login-screen.tsx`, `src/app/api/auth/verify/route.ts`, `src/lib/server/auth.ts`, `src/app/ui/public-page.tsx`; regressions in `tests/auth-intent.test.ts`, `tests/auth-verify.test.ts`, `tests/core-auth.test.ts`, and `e2e/release.spec.ts`.

## Current local checks

| Command/check | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed, no warnings/errors |
| `pnpm test` | 313 passed; 37 files |
| `pnpm build` | Passed; Next 16.3.4 standalone output |
| `pnpm test:demo-gate` | Passed on production standalone `server.js` |
| Chromium desktop/mobile | 26 passed; auth/navigation, language persistence, slots, viewport, icons, sandbox execution/isolation |
| `scripts/smoke-discovery.mjs` within demo gate | 43 passed |
| `scripts/smoke-api.mjs` within demo gate | 69 HTTP assertions plus access/payment/inventory/booking checks passed |
| `git diff --check` | Passed |
| actionlint 1.7.12 | Workflow passed; optional shellcheck/pyflakes integrations were not available |
| PWA assets | Generated and served; exact 192×192 and 512×512 files |
| Visual inspection | Captured mobile landing and booking; no horizontal overflow in mobile/desktop tests |

The full suite initially exposed nine tests relying on default-on payments. Their paid scenarios now explicitly opt in; production defaults remain closed. A sandbox browser fixture initially lacked the profile/description/next-step required to publish; the fixture was completed without weakening publication validation.

Local demo emits a Next metadataBase fallback warning for noindex demo social images; public HTTPS canonical metadata uses the configured trusted origin. Some early browser runs logged cancelled response streams when tests closed a navigated page; the final standalone gate passed.

## Unverified external gates

- `docker version`: client installed, Docker Engine pipe unavailable. `wsl --status`: WSL not installed. Local Linux image build/boot could not run; mandatory GitHub `container` job performs that check before deployment.
- `flyctl 0.4.99 config validate --strict --config fly.toml`: requires an access token; no Fly login/token was supplied. CLI download was checked against its published SHA256; command syntax was checked with CLI help. Authenticated strict validation is part of the deploy job.
- GitHub Actions has not run these changes remotely; the branch was not pushed by this preparation.
- No Fly app was created, no runtime secret imported, no Supabase migration applied and no external deployment performed.
- Real Supabase Auth/SMTP/Storage, provider callbacks and transactions, operator identity/legal review, HTTPS/custom domain and production monitoring require operator setup and live acceptance.

The artifact is prepared for the setup process in [FLY-DEPLOYMENT.md](FLY-DEPLOYMENT.md). Deployment remains gated until the missing external checks pass. No demo or sandbox result is a claim of real revenue, bookings, email delivery or traction.
