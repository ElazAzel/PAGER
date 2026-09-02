# Implementation ledger

Spec: docs/SPEC.md
Branch: feat/pager-mvp

- [ ] Global sources and skills
- [ ] Three visual concepts and selection
- [ ] Shared typed domain contracts
- [ ] Database schema, RLS, repository, auth, secure page projection
- [ ] Checkout, webhooks, inventory, Cal, notifications
- [ ] Editor, public renderer (25 types), detail, CRM, orders, library, settings
- [ ] Integration, build, access/security review and browser verification
- [ ] Runtime guide and honest integration readiness report

Ruling: Create a new feature branch in the empty user-specified PAGER directory; a second worktree provides no isolation benefit for an empty repository.
Ruling: Core UI and styles remain coordinator-owned; independent agents may install skills or implement server modules with disjoint ownership.
Ruling: User-approved explicit visual selection is asynchronous; source setup and backend groundwork can continue while awaiting it. No UI implementation until choice.
Ruling: Secret-dependent real integrations cannot be verified without credentials; implement adapters, fixtures and sandbox tests, report exact missing configuration without representing simulations as live results.
