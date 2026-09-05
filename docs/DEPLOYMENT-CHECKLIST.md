# PAGER pilot deployment checklist

This checklist separates a runnable local demonstration from a real pilot. A green local test suite does not certify external providers.

GitHub + Fly.io setup and first release: [FLY-DEPLOYMENT.md](FLY-DEPLOYMENT.md).

## Before deployment

- Set `PAGER_DEMO=false` and `PAGER_APP_URL` to the canonical HTTPS origin.
- Configure `DATABASE_URL`, Supabase URL/anon key, service-role key and a stable `PAGER_INTEGRATION_KEY` in the deployment secret store.
- Apply the ordered SQL migrations with `pnpm db:migrate` against the intended empty or reconciled Supabase project.
- Confirm all `pager_*` tables use forced RLS and `pager-private` is private.
- Configure Supabase Auth email templates and verified SMTP for RU/EN OTP delivery.
- Keep `PAGER_PAYMENTS_ENABLED=false` until Stripe Connect is certified.
- Set real `PAGER_OPERATOR_NAME` and `PAGER_SUPPORT_EMAIL`; review `/privacy` and `/terms`.
- Select the Fly app/region and configure GitHub `production`, its app-scoped token, and deployment variables.

## Provider certification

- Configure Stripe Connect and register `/api/webhooks/stripe`.
- Configure Cal OAuth or a verified creator API-key fallback and register signed webhooks.
- Configure Resend and Inngest only after testing sender delivery and retry behavior.
- Configure Telegram only after the bot identity and webhook secret are verified.
- Run `PAGER_REAL_URL=https://your-staging-domain.example pnpm test:real`.
- Run provider-specific sandbox checks with isolated creator and buyer accounts.

## Release gate

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:demo-gate`
- `docker build --tag pager:release-check .` and `node scripts/smoke-container.mjs`
- `git diff --check`
- `pnpm test:real`
- Browser check at mobile 390x844 and desktop width.
- Verify first external creator can publish, receive a lead, confirm a booking and complete a payment.

Do not call the pilot live until the real smoke and provider checks have passed. Do not count demo or sandbox events as traction.
