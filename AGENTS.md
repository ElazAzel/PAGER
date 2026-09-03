# PAGER

Build the user-approved MVP in docs/SPEC.md. Product name is PAGER.
Use TypeScript, Next.js App Router, Supabase, Drizzle and the integrations in the spec.
Never expose private block content, creator credentials, customer data or entitlements to unauthorized callers.
Keep the runnable local demonstration explicitly separate from real Supabase and Stripe integration mode.
Do not claim simulated payments, emails or bookings are live integrations.
Preserve all 25 block types. Russian and English are required.
Agents working concurrently own disjoint file sets. Do not reset, overwrite or commit other agents' work.
Run meaningful access/payment/inventory tests and production build before completion.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
