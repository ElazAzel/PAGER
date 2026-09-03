# PAGER database and email setup

`PAGER_DEMO=true` uses generated files under `.data/pager-demo` (or `PAGER_DATA_DIR`) and signed local demo identities. It sends no OTP email and uses no Supabase database. Keep the demo bound to loopback. These Supabase files configure the separate real integration mode, `PAGER_DEMO=false`.

## Migration authority

The authoritative migrations are the ordered SQL files in `supabase/migrations`. `src/lib/db/schema.ts` describes the normalized tables in Drizzle; the hand-authored SQL also supplies deferred composite tenant foreign keys, payload constraints, RLS, grants and a private Storage bucket. The runtime repository uses `postgres` transactions and preserves the entire JSON payload, including optional `commerce`, notification `delivery`, and opportunity `blockId` fields.

Do not run `drizzle-kit push` or generate an independent migration history from the partial Drizzle schema. There is no Drizzle migration config/journal in this project. Use Supabase CLI for migration history and deployment. [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

Supabase CLI 2.116.0 is pinned as a development dependency. `pnpm db:generate <migration-name>` creates a SQL migration; `pnpm db:migrate --dry-run` checks pending migrations against the linked project; `pnpm db:migrate` applies them. Do not generate a competing Drizzle history.

## Hosted Supabase

With an available Supabase CLI, run from the PAGER repository root. Keep access tokens, database passwords and keys in the local secret environment or CLI prompts; never commit them.

```powershell
pnpm exec supabase login
pnpm exec supabase link --project-ref YOUR_PROJECT_REF
pnpm exec supabase migration list
pnpm db:migrate --dry-run
pnpm db:migrate
```

`db push` applies pending migrations and records them in Supabase migration history. Use an empty project for the initial migration; reconcile an existing schema/history before applying it. Do not reset a live database. Hosted database migration does not require a local Docker stack. [CLI db push reference](https://supabase.com/docs/reference/cli/supabase-db-push).

Set the core variables from `.env.example`: `PAGER_DEMO=false`, canonical HTTPS `PAGER_APP_URL`, server-only `DATABASE_URL`, the Supabase URL/anon key, and server-only service-role key. The runtime DB role must be a trusted owner with BYPASSRLS: browser roles cannot publish, grant access, change stock or read raw private page payloads. Use the Supabase connection string for the correct project and retain its TLS settings.

After migration, verify the 16 `pager_*` tables and their enabled/forced RLS, authenticated tenant policies and denied anonymous access. Confirm `pager-private` exists and is **private**, has a 10 MiB upload limit and no broad browser object policies. PAGER authorizes `/api/assets/[id]` before issuing a 60-second signed URL; changing the bucket to public bypasses that protection.

## RU/EN OTP email

The two templates use `{{ .Token }}` for the code submitted to `/api/auth/verify` (`verifyOtp` with `type: "email"`). Language comes from stored `auth.users.user_metadata.locale`: `en` selects English; `ru` or missing locale selects Russian. The OTP endpoint supplies locale on signup. A returning user's saved locale can differ from an unauthenticated login form selection; do not update identity metadata on the basis of an unverified email. Subjects are deliberately bilingual. [Supabase template variables](https://supabase.com/docs/guides/auth/auth-email-templates).

For hosted projects, copy `templates/confirmation.html` into Auth → Email Templates → Confirm signup, and `templates/magic-link.html` into Magic link. Use the subjects from `config.toml`. Enable email confirmations, set OTP length to 6 and expiry to 600 seconds (matching the text), configure the canonical Site URL and a verified custom SMTP sender. Apply these hosted Auth settings separately: `db push` does not deploy the local template files. [Local versus hosted email configuration](https://supabase.com/docs/guides/local-development/customizing-email-templates).

Verify a new and returning RU user and EN user with actual received mail, the submitted code, a confirmed session, expired/wrong-code rejection, and cross-device purchase library access. Check that a forwarded public page contains no purchased body or file URL. Sending, delivery, hosted template rendering and live Storage have not been verified in this task.

## Optional local Supabase later

`config.toml` configures Postgres 17, Auth/Storage and local email capture on port 54324. It disables SQL seeding so fictional PAGER demo customers are never inserted into real integration storage. On a machine that already has a working container runtime and Supabase CLI, `supabase start` applies local migrations and loads the templates; use its local credentials with `PAGER_DEMO=false`. Local email capture is not external delivery. Do not copy the loopback Auth configuration over hosted production settings.

This workstation's missing WSL/container prerequisite is an existing coordinator-reported blocker. This task neither installs an OS component/CLI nor starts Docker. Existing PGlite SQL/RLS tests validate SQL behavior, not the Supabase Auth/Storage runtime.
