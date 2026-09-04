import { describe, expect, it } from "vitest";
import { createDemoState } from "../src/lib/server/seed";
import { analyticsRequestExcluded, creatorAnalyticsReport, recordAnalytics } from "../src/lib/server/metrics";
import { applyCommerceEvent } from "../src/lib/integrations/transitions";
import type { AnalyticsEvent, DatabaseState, Opportunity, Order } from "../src/lib/types";

const now = new Date("2026-09-03T12:00:00.000Z");
function fixture() {
  const state = createDemoState();
  state.analytics = []; state.opportunities = []; state.orders = []; state.bookings = [];
  return state;
}
function opportunity(state: DatabaseState, id = "op", overrides: Partial<Opportunity> = {}) {
  const value: Opportunity = { id, ownerId: "creator-anna", pageId: "page-anna", contactId: "seed-contact-0", source: "purchase", status: "paid", message: "", convertedAt: now.toISOString(), createdAt: now.toISOString(), test: false, ...overrides };
  state.opportunities.push(value); return value;
}
function order(state: DatabaseState, id = "order", overrides: Partial<Order> = {}) {
  const value: Order = { id, ownerId: "creator-anna", pageId: "page-anna", buyerId: "buyer-primary", contactId: "seed-contact-0", opportunityId: "op", scope: "page", title: "Private purchase", mode: "one_time", quantity: 1, amount: 2000, shippingAmount: 0, currency: "USD", status: "pending", fulfillment: "unfulfilled", expiresAt: now.toISOString(), createdAt: now.toISOString(), test: false, stripeAccountId: "acct_anna", ...overrides };
  state.orders.push(value); return value;
}
function paid(state: DatabaseState, order: Order, paymentId = `pi_${order.id}`, at = now.toISOString()) {
  applyCommerceEvent(state, { id: `paid_${paymentId}`, provider: order.test ? "demo" : "stripe", accountId: order.stripeAccountId, orderId: order.id, type: "paid", at, paymentId, amount: order.amount + order.shippingAmount, currency: order.currency, ...(order.mode === "monthly" ? { subscriptionId: `sub_${order.id}`, periodStart: at, paidThrough: "2026-10-03T12:00:00.000Z" } : {}) });
}
function event(state: DatabaseState, id: string, overrides: Partial<AnalyticsEvent> = {}) {
  state.analytics.push({ id, ownerId: "creator-anna", pageId: "page-anna", kind: "view", visitorId: id, createdAt: now.toISOString(), test: false, ...overrides });
}
const report = (state: DatabaseState) => creatorAnalyticsReport(state, state.users[0], { days: 7, now });

describe("page analytics collection and privacy", () => {
  it("keeps event delivery idempotent but counts distinct loads, and rekeys visitors per page and UTC day", () => {
    const state = fixture(); const input = { pageId: "page-anna", visitorId: "ephemeral-visitor", kind: "view" as const, eventId: "view-event-one", source: "search" as const, device: "mobile" as const };
    recordAnalytics(state, input, undefined, false, now);
    recordAnalytics(state, input, undefined, false, now);
    recordAnalytics(state, { ...input, eventId: "view-event-two" }, undefined, false, now);
    expect(report(state).summary).toMatchObject({ views: 2, visitors: 1 });
    recordAnalytics(state, { ...input, pageId: "page-other" }, undefined, false, now);
    recordAnalytics(state, input, undefined, false, new Date("2026-09-04T00:00:00.000Z"));
    expect(state.analytics[0].visitorId).not.toBe(state.analytics[2].visitorId);
    expect(state.analytics[0].visitorId).not.toBe(state.analytics[3].visitorId);
    expect(JSON.stringify(state.analytics)).not.toContain("ephemeral-visitor");
    expect(state.analytics[0]).toMatchObject({ source: "search", device: "mobile" });
  });
  it("rejects foreign, hidden and locked blocks, missing click target, financial kinds and owner visits", () => {
    const state = fixture(); const input = { pageId: "page-anna", kind: "click" as const, visitorId: "visitor-one" };
    for (const blockId of ["other-profile", "anna-library", "missing"]) expect(() => recordAnalytics(state, { ...input, blockId }, undefined, false, now)).toThrow("Block access denied");
    state.publishedPages[0].blocks.find(b => b.id === "anna-profile")!.hidden = true;
    expect(() => recordAnalytics(state, { ...input, blockId: "anna-profile" }, undefined, false, now)).toThrow();
    expect(() => recordAnalytics(state, input, undefined, false, now)).toThrow();
    expect(() => recordAnalytics(state, { ...input, kind: "paid" } as never, undefined, false, now)).toThrow();
    recordAnalytics(state, { ...input, kind: "view" }, "creator-anna", false, now);
    expect(state.analytics).toHaveLength(0);
  });
  it("honours privacy opt-outs and excludes known crawlers without retaining request headers", () => {
    for (const agent of ["GPTBot/1.2", "OAI-SearchBot/1.0", "Googlebot/2.1", "PerplexityBot", "Mozilla/5.0 HeadlessChrome/130", "Lighthouse"]) expect(analyticsRequestExcluded(new Request("https://pager.test", { headers: { "user-agent": agent } }))).toBe(true);
    expect(analyticsRequestExcluded(new Request("https://pager.test", { headers: { dnt: "1" } }))).toBe(true);
    expect(analyticsRequestExcluded(new Request("https://pager.test", { headers: { "sec-gpc": "1" } }))).toBe(true);
    expect(analyticsRequestExcluded(new Request("https://pager.test", { headers: { "user-agent": "Mozilla/5.0 Safari/605.1" } }))).toBe(false);
  });
  it("counts visible paid teasers and whole-page access CTAs without granting material or payment access", () => {
    const state = fixture(); const input = { pageId: "page-anna", kind: "click" as const, visitorId: "visitor-paid-interest" };
    recordAnalytics(state, { ...input, blockId: "anna-library", action: "block_access" }, undefined, false, now);
    expect(state.analytics[0]).toMatchObject({ kind: "click", blockId: "anna-library", action: "block_access" });
    expect(report(state).blocks.find(b => b.id === "anna-library")?.clicks).toBe(1);
    state.publishedPages[0].paid = true;
    recordAnalytics(state, { ...input, action: "page_access" }, undefined, false, now);
    expect(state.analytics[1]).toMatchObject({ action: "page_access", blockId: undefined });
    expect(report(state).summary.clicks).toBe(2);
    expect(state.entitlements).toHaveLength(0); expect(state.orders).toHaveLength(0); expect(state.bookings).toHaveLength(0);
    expect(JSON.stringify(state.analytics)).not.toContain("Ваш план на 30 дней");
    expect(() => recordAnalytics(state, { ...input, blockId: "anna-library" }, undefined, false, now)).toThrow("Block access denied");
  });
  it("rejects access actions for hidden, archived, foreign, unpriced and page-protected offers", () => {
    const state = fixture(); const page = state.publishedPages[0]; const paidBlock = page.blocks.find(b => b.id === "anna-library")!;
    const input = { pageId: page.id, kind: "click" as const, visitorId: "visitor-invalid-offer", action: "block_access" as const, blockId: paidBlock.id };
    for (const blockId of ["other-profile", "anna-profile", "missing"]) expect(() => recordAnalytics(state, { ...input, blockId }, undefined, false, now)).toThrow("Block access denied");
    paidBlock.hidden = true; expect(() => recordAnalytics(state, input, undefined, false, now)).toThrow(); paidBlock.hidden = false;
    paidBlock.archived = true; expect(() => recordAnalytics(state, input, undefined, false, now)).toThrow(); paidBlock.archived = false;
    const price = paidBlock.pricing; paidBlock.pricing = { currency: "USD" }; expect(() => recordAnalytics(state, input, undefined, false, now)).toThrow(); paidBlock.pricing = price;
    expect(() => recordAnalytics(state, { ...input, kind: "view" }, undefined, false, now)).toThrow("Invalid analytics action");
    expect(() => recordAnalytics(state, { ...input, action: "arbitrary_scope" } as never, undefined, false, now)).toThrow("Invalid analytics action");
    expect(() => recordAnalytics(state, { ...input, blockId: undefined, action: "page_access" }, undefined, false, now)).toThrow();
    page.paid = true;
    expect(() => recordAnalytics(state, input, undefined, false, now)).toThrow("Block access denied");
    expect(() => recordAnalytics(state, { ...input, action: "page_access" }, undefined, false, now)).toThrow();
    page.pricing = { currency: "USD", oneTime: 0 }; expect(() => recordAnalytics(state, { ...input, blockId: undefined, action: "page_access" }, undefined, false, now)).toThrow();
    page.pricing = { currency: "USD", oneTime: 1000 };
    state.entitlements.push({ id: "whole-page", ownerId: page.ownerId, buyerId: "buyer-primary", pageId: page.id, scope: "page", orderId: "existing", status: "active", expiresAt: null, createdAt: now.toISOString() });
    recordAnalytics(state, input, "buyer-primary", false, now);
    expect(state.analytics).toHaveLength(1);
  });
});

describe("creator report tenant, date and outcome boundaries", () => {
  it("scopes every aggregate to the session owner and excludes test, owner, bot and future events", () => {
    const state = fixture();
    event(state, "valid", { source: "ai", device: "mobile" });
    event(state, "test", { test: true }); event(state, "bot", { isBot: true }); event(state, "owner", { visitorId: "creator-anna" });
    event(state, "other", { ownerId: "creator-other", pageId: "page-other" }); event(state, "wrong-page", { pageId: "page-other" }); event(state, "future", { createdAt: "2026-09-03T12:00:00.001Z" });
    opportunity(state, "unconfirmed");
    const result = report(state);
    expect(result.summary).toMatchObject({ views: 1, visitors: 1, clicks: 0, conversions: 0, revenueByCurrency: {} });
    expect(result.sources[0]).toEqual({ key: "ai", views: 1, share: 1 });
    expect(result.devices[0]).toEqual({ key: "mobile", views: 1, share: 1 });
    expect(result.excluded).toEqual({ testEvents: 1, automatedEvents: 1, ownerEvents: 1 });
    expect(JSON.stringify(result)).not.toMatch(/other-profile|Private purchase|elena@example|visitorId|creator-other/);
    expect(creatorAnalyticsReport(state, state.users[1], { days: 7, now }).summary.views).toBe(1);
    expect(() => creatorAnalyticsReport(state, state.users[2], { now })).toThrow("Creator account required");
  });
  it("uses complete UTC date buckets plus partial today, with exact inclusive boundaries and no future data", () => {
    const state = fixture();
    event(state, "before", { createdAt: "2026-08-27T23:59:59.999Z" });
    event(state, "start", { createdAt: "2026-08-28T00:00:00.000Z" });
    event(state, "end", { createdAt: now.toISOString() });
    event(state, "after", { createdAt: "2026-09-03T12:00:00.001Z" });
    expect(report(state).summary.views).toBe(2);
    expect(report(state).daily).toHaveLength(7);
    expect(report(state).daily[0]).toMatchObject({ date: "2026-08-28", views: 1 });
    expect(report(state).daily[6]).toMatchObject({ date: "2026-09-03", views: 1 });
    expect(creatorAnalyticsReport(state, state.users[0], { days: 30, now }).daily).toHaveLength(30);
    expect(creatorAnalyticsReport(state, state.users[0], { days: 90, now }).daily).toHaveLength(90);
    expect(() => creatorAnalyticsReport(state, state.users[0], { days: 365 as never, now })).toThrow();
  });
  it("calculates click engagement only from observed viewers and represents unavailable rates honestly", () => {
    const state = fixture();
    expect(report(state).summary.clickRate).toBeNull();
    event(state, "view-1", { visitorId: "one" }); event(state, "view-2", { visitorId: "two" });
    event(state, "click-1", { kind: "click", visitorId: "one", blockId: "anna-booking" });
    event(state, "click-2", { kind: "click", visitorId: "one", blockId: "anna-booking" });
    event(state, "click-unobserved", { kind: "click", visitorId: "third", blockId: "anna-form" });
    const result = report(state);
    expect(result.summary).toMatchObject({ visitors: 2, clicks: 3, engagedVisitors: 1, clickRate: .5 });
    expect(result.blocks[0]).toMatchObject({ id: "anna-booking", clicks: 2, visitors: 1 });
  });
  it("reports funnel intent actions separately from confirmed outcomes", () => {
    const state = fixture();
    event(state, "form-open", { kind: "click", visitorId: "one", blockId: "anna-form", action: "form_open" });
    event(state, "form-submit", { kind: "click", visitorId: "one", blockId: "anna-form", action: "form_submit" });
    event(state, "booking-start", { kind: "click", visitorId: "two", blockId: "anna-booking", action: "booking_start" });
    event(state, "booking-confirmed", { kind: "click", visitorId: "two", blockId: "anna-booking", action: "booking_confirmed" });
    expect(report(state).summary).toMatchObject({ formOpens: 1, formSubmits: 1, bookingStarts: 1, bookingConfirmed: 1, conversions: 0 });
  });
  it("uses confirmed payment facts for receipts, separates currencies and includes renewals less refunds and disputes", () => {
    const state = fixture(); opportunity(state);
    const usd = order(state, "usd", { mode: "monthly" }); paid(state, usd, "pi_first"); paid(state, usd, "pi_renewal");
    const eur = order(state, "eur", { currency: "EUR", amount: 3000 }); paid(state, eur);
    applyCommerceEvent(state, { id: "partial-refund", provider: "stripe", accountId: "acct_anna", orderId: usd.id, type: "refund", at: now.toISOString(), paymentId: "pi_first", amount: 2000, currency: "USD", refundedAmount: 500 });
    const disputed = order(state, "disputed"); paid(state, disputed);
    applyCommerceEvent(state, { id: "dispute", provider: "stripe", accountId: "acct_anna", orderId: disputed.id, type: "dispute", at: now.toISOString(), paymentId: "pi_disputed", amount: 2000, currency: "USD", dispute: "open" });
    const test = order(state, "test", { test: true }); paid(state, test);
    const sandbox = order(state, "sandbox"); paid(state, sandbox); Object.assign(sandbox, { commerce: { ...(sandbox as Order & { commerce: object }).commerce, sandbox: true } });
    const owner = order(state, "owner", { buyerId: "creator-anna" }); paid(state, owner);
    const future = order(state, "future"); paid(state, future, "pi_future", "2026-09-04T00:00:00Z");
    order(state, "fake-paid", { status: "paid", paidAt: now.toISOString(), amount: 999999 });
    expect(report(state).summary).toMatchObject({ revenueByCurrency: { USD: 3500, EUR: 3000 }, paidOrders: 2, conversions: 1 });
  });
  it("counts booking and its payment once, rejects unsupported converted opportunities and identifies repeat customers", () => {
    const state = fixture(); opportunity(state);
    state.bookings.push({ id: "cal-booking", ownerId: "creator-anna", pageId: "page-anna", buyerId: "buyer-primary", contactId: "seed-contact-0", opportunityId: "op", providerId: "cal-confirmed", title: "Confirmed call", status: "confirmed", startAt: now.toISOString(), endAt: now.toISOString(), timezone: "UTC", version: 1, test: false, createdAt: now.toISOString() });
    paid(state, order(state));
    opportunity(state, "fake-booked", { source: "booking", status: "booked" });
    opportunity(state, "old", { convertedAt: "2026-08-01T12:00:00.000Z" });
    paid(state, order(state, "old-order", { opportunityId: "old" }), "pi_old", "2026-08-01T12:00:00.000Z");
    expect(report(state).summary).toMatchObject({ bookings: 1, paidOrders: 1, conversions: 1, repeatContacts: 1 });
  });
});
