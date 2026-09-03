# Coordinator-owned contracts (stable)

Types are in src/lib/types.ts. All money is integer minor units. All dates ISO UTC. Do not change exported types without messaging coordinator. Add optional fields only if necessary and report.

## Core server agent exports

src/lib/server/store.ts: `readState(): Promise<DatabaseState>`, `mutateState<T>(fn: (state: DatabaseState) => T | Promise<T>): Promise<T>`; `isDemoMode(): boolean`. Both local file implementation with cross-process lock+atomic writes, and normalized PostgreSQL implementation with transactional advisory lock and diff-based row persistence (never overwrite all tenant data or delete unknown rows). Server-only. Production use fails closed if DB not configured. Demo allowed only explicit env PAGER_DEMO=true AND development or loopback request guard; no demo auto-default in production. Database mode persists each entity in normalized tables (Drizzle schema JSON payload plus typed ids/owner ids acceptable; owner RLS enforced). Production service accesses server only. Core agent owns migration/RLS and data seeding.

src/lib/server/auth.ts: `currentUser(): Promise<User|null>`, `requireUser(): Promise<User>`, `assertSameOrigin(request: Request): void`; demo session signed HttpOnly cookie and loopback-only login endpoints. Real Supabase SSR OTP sessions. No arbitrary user ID auth. No automatic session for anonymous public pages.

src/lib/server/access.ts: `canAccessBlock(page:Page,block:Block,userId:string|undefined,entitlements:Entitlement[],now?:Date):boolean`; `projectPage(page:Page,userId:string|undefined,entitlements:Entitlement[],demo:boolean):PublicPage`. No body leakage. `canAccessItem(state:DatabaseState,item:CatalogItem,userId?:string,sourceBlockId?:string):boolean`. These are pure and tested.

src/lib/server/crm.ts: `upsertContact(state,ownerId,email,name):Contact`; `createOpportunity(state,{ownerId,pageId,contactId,source,message?,test?, id?}):Opportunity`; `addTimeline(state,{ownerId,contactId,kind,title,referenceId?}):TimelineEvent`; `markConverted(state,opportunityId,status:'booked'|'paid'):void`. Synchronous mutations within transaction.

src/lib/server/http.ts: `jsonError(error:unknown):Response`; `ApiError(status:number,message:string)` class. All route errors JSON {error:string}.

## Frontend HTTP contract

GET /api/session -> {user: User|null,demo:boolean}
POST /api/auth/otp {email,locale,role?} -> {sent:true}; POST /api/auth/verify {email,token} -> {user}; POST /api/auth/logout -> {ok:true}
POST /api/demo/session {role:'creator'|'buyer',identity?:'primary'|'secondary'} -> {user}; only explicit loopback demo
GET /api/dashboard -> DashboardData; unauthenticated 401
PUT /api/page {page:Page} -> {page:Page}; own-page validated/version check; PUT never updates published copy
POST /api/page/publish -> {page:Page,url:string}
GET /api/public/[slug] -> {page:PublicPage,items:CatalogItem[]} (ONLY items in accessible visible blocks, redact paid digital file fields)
GET /api/public/[slug]/items/[id]?blockId= -> {item:CatalogItem,page:PublicPage,blockId:string} or 403
POST /api/leads {pageId,blockId,name,email,message} -> {ok:true}; public form gate checked
POST /api/analytics {pageId,kind:'view'|'click',visitorId,blockId?} -> {ok:true}
GET /api/contacts/export -> csv; PATCH /api/contacts/[id] {notes} -> {contact}
POST /api/items {item:CatalogItem} -> {item}; PATCH /api/orders/[id] {fulfillment,tracking} -> {order}
GET /api/purchases -> {orders,subscriptions,entitlements,bookings,pages:PublicPage[],items:CatalogItem[],demo:boolean}; library includes purchased hidden/archived blocks; do not apply the public visibility filter to these purchased materials
POST /api/assets (multipart file,pageId) -> {asset:Asset,url:string}; GET /api/assets/[id] -> redirect signed URL or protected stream, gate via block/item referencing the asset; owner session allowed

## Integrations agent HTTP contract

POST /api/checkout CheckoutInput -> {url:string,orderId:string,demo:boolean}; demo URL /checkout/[orderId]
GET /api/checkout/[id] -> {order:Order,demo:boolean}; POST /api/checkout/[id] {action:'pay'|'cancel'} -> {order}; POST only explicitly marked loopback demo; real payment via signed Stripe webhooks only
POST /api/subscriptions/[id]/cancel -> {subscription}
POST /api/orders/[id]/refund -> {order} (owner only, real provider refund; demo clearly labelled)
POST /api/integrations/stripe/connect -> {url}; GET callback uses authenticated owner and validated state; POST refresh -> {connected,ready}
POST /api/integrations/cal {apiKey?,calLink?} -> {connected,calLink}; encrypted secret never returned. OAuth start/callback optional API routes for approved client.
GET /api/integrations/telegram -> {configured:boolean,connected:boolean}; current verified recipient only, including buyers
POST /api/integrations/telegram {} -> {url:string,expiresAt:string}; creates a single-use ten-minute bot pairing link for the session recipient, never accepts a caller-supplied chat or recipient ID
DELETE /api/integrations/telegram -> {connected:false}; removes the current recipient's pairing/connection
POST /api/bookings {pageId,blockId,itemId?,startAt?,name,email,timezone} -> {booking,orderId?}; demo implementation only for local selected slot; real Cal embed + verified webhook source truth
POST /api/bookings/[id]/cancel -> {booking}; PATCH /api/bookings/[id] {startAt,endAt,timezone} -> {booking}; authorized owner or verified buyer
POST /api/webhooks/stripe; POST /api/webhooks/cal/[ownerId]; POST /api/webhooks/telegram (secret header required); GET/POST/PUT /api/inngest

Integrations may use store transactional state + crm/access/auth exports. Define tests of pure event/inventory transitions independently of credentials. Use standard Node crypto for encrypted provider secrets and signatures. Never grant on redirects.

## Ownership

Coordinator: types.ts, project configs/package, all React UI/i18n/block editor/rendering/pages, docs main plan.
Core agent: src/lib/server/** except integration module; src/lib/db/**; supabase/**; API routes listed in core section; tests/core*.test.ts; .env.example core settings (coordinate integration append separately).
Integrations agent: src/lib/integrations/**; its listed routes; tests/integrations*.test.ts; docs/INTEGRATIONS.md (env additions here for coordinator merge).
Source agent: global skills/references, docs/sources*, scripts/setup-sources*.

Do not install packages or edit package/lock while coordinator installs. Do not spawn subagents. Do not commit other people's changes. Send interface concerns early, make implementation robust and fully typed.
