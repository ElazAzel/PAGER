import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { AccessPrice, AnalyticsAction, AnalyticsDays, AnalyticsDevice, AnalyticsReport, AnalyticsSource, DatabaseState, DashboardData, User } from "../types";
import { runtimeReadiness } from "./readiness";
import type { CommerceOrder } from "../integrations/model";
import { ApiError } from "./http";
import { canAccessBlock } from "./access";
import { telegramStatus } from "../integrations/telegram";
import { pricingSchema } from "./validation";

type AnalyticsInput = { pageId: string; kind: "view" | "click"; visitorId: string; blockId?: string; action?: AnalyticsAction; source?: AnalyticsSource; device?: AnalyticsDevice; eventId?: string };
export function analyticsRequestExcluded(request: Request): boolean {
  return request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1" || /bot\b|crawler|spider|headless|lighthouse|playwright|selenium|preview|slurp|facebookexternalhit|scan(?:ner)?\b/i.test(request.headers.get("user-agent") ?? "");
}
export function recordAnalytics(state: DatabaseState, input: AnalyticsInput, userId?: string, test = false, now = new Date()): void {
  const page = state.publishedPages.find(p => p.id === input.pageId && p.publishedAt); if (!page) throw new ApiError(404, "Page not found");
  if (userId === page.ownerId) return;
  if (input.kind !== "view" && input.kind !== "click") throw new ApiError(400, "Unsupported analytics event");
  if (input.action && (input.kind !== "click" || !["page_access", "block_access", "form_open", "form_submit", "booking_start", "booking_confirmed"].includes(input.action))) throw new ApiError(400, "Invalid analytics action");
  const hasOffer = (pricing: AccessPrice) => pricingSchema.safeParse(pricing).success && !!(pricing.oneTime || pricing.monthly);
  if (input.action === "page_access") {
    if (input.blockId || !page.paid || !hasOffer(page.pricing)) throw new ApiError(403, "Access offer unavailable");
  } else {
    if (input.kind === "click" && !input.blockId) throw new ApiError(400, "A public block is required for click events");
    if (input.blockId) {
      const block = page.blocks.find(b => b.id === input.blockId && !b.archived && !b.hidden);
      // A teaser click records interest only. The page gate and visibility still apply; no material is returned or unlocked.
      const accessible = block && (input.action === "block_access"
        ? block.paid && hasOffer(block.pricing) && canAccessBlock(page, { ...block, paid: false }, userId, state.entitlements, now)
        : canAccessBlock(page, block, userId, state.entitlements, now));
      if (!accessible) throw new ApiError(403, "Block access denied");
    }
  }
  const day = now.toISOString().slice(0, 10);
  // Tokens are supplied per page/session, then re-keyed per page/day. Never retain raw tokens, IPs, URLs or user agents.
  const visitorId = createHash("sha256").update(`${page.id}:${day}:${input.visitorId}`).digest("hex");
  const id = input.eventId ? `event:${createHash("sha256").update(`${page.id}:${day}:${visitorId}:${input.eventId}`).digest("hex")}` : randomUUID();
  if (state.analytics.some(e => input.eventId ? e.id === id : e.pageId === page.id && e.kind === input.kind && e.visitorId === visitorId && e.blockId === input.blockId && e.action === input.action && e.test === test && e.createdAt.slice(0, 10) === day)) return;
  state.analytics.push({ id, ownerId: page.ownerId, pageId: page.id, kind: input.kind, visitorId, blockId: input.blockId, ...(input.action ? { action: input.action } : {}), source: input.source ?? "unknown", device: input.device ?? "unknown", test, createdAt: now.toISOString() });
}

/** Creator-only projection. Currency values are minor units, never combined across currencies. */
export function creatorAnalyticsReport(state: DatabaseState, user: User, options: { days?: AnalyticsDays; demo?: boolean; now?: Date } = {}): AnalyticsReport {
  if (user.role !== "creator" || !state.users.some(u => u.id === user.id && u.role === "creator")) throw new ApiError(403, "Creator account required");
  const days = options.days ?? 30;
  if (![7, 30, 90].includes(days)) throw new ApiError(400, "Choose 7, 30 or 90 days");
  const now = options.now ?? new Date(); const end = now.getTime();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1);
  const inPeriod = (value: string | null | undefined) => !!value && Date.parse(value) >= start && Date.parse(value) <= end;
  const pageIds = new Set(state.pages.filter(p => p.ownerId === user.id).map(p => p.id));
  const scoped = (row: { ownerId: string; pageId: string }) => row.ownerId === user.id && pageIds.has(row.pageId);
  const ownerEmail = user.email.trim().toLowerCase();
  const ownerContacts = new Set(state.contacts.filter(c => c.ownerId === user.id && c.email.trim().toLowerCase() === ownerEmail).map(c => c.id));
  const validContacts = new Set(state.contacts.filter(c => c.ownerId === user.id && !ownerContacts.has(c.id)).map(c => c.id));
  const rawEvents = state.analytics.filter(e => scoped(e) && inPeriod(e.createdAt));
  const events = rawEvents.filter(e => !e.test && !e.isBot && !e.isOwner && e.visitorId !== user.id);
  const views = events.filter(e => e.kind === "view"); const clicks = events.filter(e => e.kind === "click");
  const actionCount = (action: AnalyticsAction) => clicks.filter(event => event.action === action).length;
  // Legacy events may have an older hash scheme, so always include page and UTC date in aggregation keys.
  const visitorKey = (e: (typeof events)[number]) => `${e.pageId}:${e.createdAt.slice(0, 10)}:${e.visitorId}`;
  const visitors = new Set(views.map(visitorKey));
  const engaged = new Set(clicks.map(visitorKey).filter(key => visitors.has(key)));
  const realOrders = (state.orders as CommerceOrder[]).filter(o => scoped(o) && !o.test && !o.commerce?.sandbox && !!o.stripeAccountId && o.buyerId !== user.id && validContacts.has(o.contactId));
  const confirmedPayments = realOrders.flatMap(order => Object.values(order.commerce?.payments ?? {})
    .filter(p => p.paid && p.paidAt && Date.parse(p.paidAt) <= end && Number.isSafeInteger(p.amount) && p.amount >= 0 && p.currency.toUpperCase() === order.currency.toUpperCase())
    .map(payment => ({ order, payment })));
  const netPayment = (payment: (typeof confirmedPayments)[number]["payment"]) => payment.dispute === "open" || payment.dispute === "lost" ? 0 : Math.max(0, payment.amount - payment.refundedAmount);
  const realBookings = state.bookings.filter(b => scoped(b) && !b.test && b.buyerId !== user.id && validContacts.has(b.contactId) && !!b.providerId && b.status === "confirmed" && Date.parse(b.createdAt) <= end);
  const paidOpportunityIds = new Set(confirmedPayments.filter(({ payment }) => netPayment(payment) > 0).map(({ order }) => order.opportunityId));
  const bookedOpportunityIds = new Set(realBookings.map(b => b.opportunityId));
  const allConverted = state.opportunities.filter(o => scoped(o) && !o.test && validContacts.has(o.contactId) && o.convertedAt && Date.parse(o.convertedAt) <= end && (paidOpportunityIds.has(o.id) || bookedOpportunityIds.has(o.id)));
  const converted = allConverted.filter(o => inPeriod(o.convertedAt));
  const revenueByCurrency: Record<string, number> = {};
  const paymentsInPeriod = confirmedPayments.filter(({ payment }) => inPeriod(payment.paidAt));
  for (const { payment } of paymentsInPeriod) {
    const amount = netPayment(payment); const currency = payment.currency.toUpperCase();
    if (amount > 0) revenueByCurrency[currency] = (revenueByCurrency[currency] ?? 0) + amount;
  }
  const daily = Array.from({ length: days }, (_, i) => ({ date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), views: 0, visitors: 0, clicks: 0, conversions: 0 }));
  const byDay = new Map(daily.map(day => [day.date, day]));
  const dailyVisitors = new Map<string, Set<string>>();
  for (const event of views) { const date = event.createdAt.slice(0, 10); const bucket = byDay.get(date); if (bucket) { bucket.views++; const keys = dailyVisitors.get(date) ?? new Set<string>(); keys.add(visitorKey(event)); dailyVisitors.set(date, keys); bucket.visitors = keys.size; } }
  for (const event of clicks) { const bucket = byDay.get(event.createdAt.slice(0, 10)); if (bucket) bucket.clicks++; }
  for (const opportunity of converted) { const bucket = byDay.get(opportunity.convertedAt!.slice(0, 10)); if (bucket) bucket.conversions++; }
  const sources: AnalyticsReport["sources"] = (["direct", "search", "social", "ai", "referral", "unknown"] as const).map(key => { const count = views.filter(e => (e.source ?? "unknown") === key).length; return { key, views: count, share: views.length ? count / views.length : 0 }; }).sort((a, b) => b.views - a.views);
  const devices: AnalyticsReport["devices"] = (["mobile", "tablet", "desktop", "unknown"] as const).map(key => { const count = views.filter(e => (e.device ?? "unknown") === key).length; return { key, views: count, share: views.length ? count / views.length : 0 }; }).sort((a, b) => b.views - a.views);
  const blocks = state.publishedPages.filter(p => p.ownerId === user.id && pageIds.has(p.id) && p.publishedAt).flatMap(p => p.blocks.filter(b => !b.hidden && !b.archived).map(block => {
    const blockClicks = clicks.filter(e => e.pageId === p.id && e.blockId === block.id);
    return { id: block.id, type: block.type, title: (block.data.title || block.data.name || block.data.label || block.teaser || block.type).slice(0, 160), clicks: blockClicks.length, visitors: new Set(blockClicks.map(visitorKey)).size };
  })).sort((a, b) => b.clicks - a.clicks);
  return {
    days, startAt: new Date(start).toISOString(), endAt: now.toISOString(), timezone: "UTC", demo: options.demo ?? false, hasPublishedPage: state.publishedPages.some(p => p.ownerId === user.id && pageIds.has(p.id) && p.publishedAt),
    summary: { views: views.length, visitors: visitors.size, clicks: clicks.length, engagedVisitors: engaged.size, clickRate: visitors.size ? engaged.size / visitors.size : null, leads: state.opportunities.filter(o => scoped(o) && !o.test && validContacts.has(o.contactId) && o.source === "form" && inPeriod(o.createdAt)).length, bookings: realBookings.filter(b => inPeriod(b.createdAt)).length, paidOrders: new Set(paymentsInPeriod.filter(({ payment }) => netPayment(payment) > 0).map(({ order }) => order.id)).size, conversions: converted.length, repeatContacts: new Set(converted.filter(o => allConverted.some(previous => previous.contactId === o.contactId && previous.id !== o.id && Date.parse(previous.convertedAt!) < Date.parse(o.convertedAt!))).map(o => o.contactId)).size, formOpens: actionCount("form_open"), formSubmits: actionCount("form_submit"), bookingStarts: actionCount("booking_start"), bookingConfirmed: actionCount("booking_confirmed"), revenueByCurrency },
    daily, sources, devices, blocks,
    excluded: { testEvents: rawEvents.filter(e => e.test).length, automatedEvents: rawEvents.filter(e => !e.test && e.isBot).length, ownerEvents: rawEvents.filter(e => !e.test && !e.isBot && (e.isOwner || e.visitorId === user.id)).length },
  };
}
export function calculateMetrics(state: DatabaseState, ownerId: string, now = new Date()): DashboardData["metrics"] & { revenueByCurrency: Record<string, number> } {
  const start = now.getTime() - 7 * 86400_000; const inWeek = (date: string): boolean => Date.parse(date) >= start && Date.parse(date) <= now.getTime();
  const events = state.analytics.filter(e => e.ownerId === ownerId && !e.test && inWeek(e.createdAt) && e.visitorId !== ownerId);
  const views = events.filter(e => e.kind === "view");
  const pageIds = new Set(state.publishedPages.filter(p => p.ownerId === ownerId && !!p.publishedAt).map(p => p.id));
  const activePages = new Set(views.filter(e => pageIds.has(e.pageId)).map(e => e.pageId)).size;
  const converted = state.opportunities.filter(o => o.ownerId === ownerId && !o.test && o.convertedAt && inWeek(o.convertedAt));
  const allConverted = state.opportunities.filter(o => o.ownerId === ownerId && !o.test && o.convertedAt);
  const repeatContacts = new Set(converted.filter(o => allConverted.some(previous => previous.contactId === o.contactId && previous.id !== o.id && Date.parse(previous.convertedAt!) < Date.parse(o.convertedAt!))).map(o => o.contactId)).size;
  const revenueByCurrency: Record<string, number> = {};
  for (const order of state.orders.filter(o => o.ownerId === ownerId && o.buyerId !== ownerId && !o.test && !(o as typeof o & { commerce?: { sandbox?: boolean } }).commerce?.sandbox && o.status === "paid" && o.paidAt && inWeek(o.paidAt))) revenueByCurrency[order.currency] = (revenueByCurrency[order.currency] ?? 0) + order.amount;
  return { views: views.length, clicks: events.filter(e => e.kind === "click").length, conversions: new Set(converted.map(o => o.id)).size, northStar: activePages ? converted.length / activePages : 0, activePages, repeatContacts, revenue: Object.keys(revenueByCurrency).length === 1 ? Object.values(revenueByCurrency)[0] : 0, revenueByCurrency };
}
export function diagnosticMetrics(state: DatabaseState, ownerId: string, now = new Date()) {
  const week = now.getTime() - 7 * 86400_000;
  const events = state.analytics.filter(e => e.ownerId === ownerId && !e.test && Date.parse(e.createdAt) >= week && Date.parse(e.createdAt) <= now.getTime());
  const creator = state.users.find(u => u.id === ownerId);
  const first = state.bookings.filter(b => b.ownerId === ownerId && b.buyerId !== ownerId && !b.test && b.status === "confirmed" && Date.parse(b.createdAt) <= now.getTime()).map(b => Date.parse(b.createdAt)).sort((a, b) => a - b)[0];
  return { activatedWithin24h: !!creator && !!first && first >= Date.parse(creator.createdAt) && first - Date.parse(creator.createdAt) <= 86400_000, paymentFailures: events.filter(e => e.kind === "payment_failed").length, notificationFailures: events.filter(e => e.kind === "notification_failed").length };
}
export function dashboardData(state: DatabaseState, user: User, demo: boolean): DashboardData & { diagnostics: ReturnType<typeof diagnosticMetrics> } {
  if (user.role !== "creator") throw new ApiError(403, "Creator account required");
  const page = state.pages.find(p => p.ownerId === user.id); if (!page) throw new ApiError(404, "Page not found");
  const integration = state.integrations.find(i => i.ownerId === user.id);
  return structuredClone({ user, page, items: state.items.filter(i => i.ownerId === user.id), contacts: state.contacts.filter(i => i.ownerId === user.id), opportunities: state.opportunities.filter(i => i.ownerId === user.id), bookings: state.bookings.filter(i => i.ownerId === user.id), orders: state.orders.filter(i => i.ownerId === user.id), timeline: state.timeline.filter(i => i.ownerId === user.id), integration: { stripeConnected: !!integration?.stripeAccountId, stripeReady: !!integration?.stripeReady, calConnected: !!(integration?.calApiKeyEncrypted || integration?.calAccessTokenEncrypted), calLink: integration?.calLink ?? "", telegramConnected: telegramStatus(state, user).connected }, metrics: calculateMetrics(state, user.id), diagnostics: diagnosticMetrics(state, user.id), readiness: runtimeReadiness(), demo });
}
