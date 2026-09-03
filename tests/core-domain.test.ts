import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState } from "../src/lib/server/seed";
import { savePage, publishPage } from "../src/lib/server/pages";
import { upsertContact, createOpportunity, markConverted } from "../src/lib/server/crm";
import { recordAnalytics, calculateMetrics, diagnosticMetrics, dashboardData } from "../src/lib/server/metrics";
import type { Order } from "../src/lib/types";
import { reconcileVerifiedBookings } from "../src/lib/server/identity";
import { createBlock } from "../src/lib/blocks";
import { BLOCK_TYPES } from "../src/lib/types";
import { sanitizeRichText } from "../src/lib/server/sanitize";
import { applyTelegramUpdate, createTelegramPair, disconnectTelegram } from "../src/lib/integrations/telegram";

describe("draft and tenant transactions", () => {
  it("roundtrips all 25 editor defaults in both languages, including anchors, scratch bonuses and sandbox HTML", () => {
    for (const locale of ["ru", "en"] as const) {
      const state = createDemoState(); const draft = structuredClone(state.pages[0]);
      draft.locale = locale; draft.blocks = BLOCK_TYPES.map(type => createBlock(type, locale));
      draft.blocks.find(b => b.type === "custom_code")!.data.html = '<script>window.example = 1</script><p>Sandbox widget</p>';
      const saved = savePage(state, "creator-anna", draft);
      expect(saved.blocks).toHaveLength(25);
      expect(saved.blocks.find(b => b.type === "profile")?.data.url).toBe("#booking");
      expect(saved.blocks.find(b => b.type === "scratch")?.data.code).toBe("WELCOME");
      expect(saved.blocks.find(b => b.type === "custom_code")?.data.html).toContain("<script>");
    }
  });
  it("links only unclaimed calendar bookings to a verified email within each contact tenant", () => {
    const state = createDemoState(); const now = new Date().toISOString();
    const booking = { id: "unclaimed", ownerId: "creator-anna", pageId: "page-anna", contactId: "seed-contact-0", opportunityId: "op", title: "External Cal", startAt: now, endAt: now, timezone: "UTC", status: "confirmed" as const, version: 1, createdAt: now, test: false };
    state.bookings = [booking, { ...booking, id: "already-claimed", buyerId: "buyer-secondary" }, { ...booking, id: "wrong-contact-tenant", contactId: "seed-contact-1" }, { ...booking, id: "demo-booking", test: true }];
    reconcileVerifiedBookings(state, state.users[2]);
    expect(state.bookings[0].buyerId).toBe("buyer-primary");
    expect(state.bookings[1].buyerId).toBe("buyer-secondary");
    expect(state.bookings[2].buyerId).toBeUndefined();
    expect(state.bookings[3].buyerId).toBeUndefined();
    reconcileVerifiedBookings(state, state.users[3]);
    expect(state.bookings[0].buyerId).toBe("buyer-primary");
    state.users[0].email = state.users[2].email;
    state.bookings.push({ ...booking, id: "own-booking", buyerId: undefined });
    reconcileVerifiedBookings(state, state.users[0]);
    expect(state.bookings.at(-1)?.buyerId).toBeUndefined();
  });
  it("saves only a draft and atomically publishes a detached snapshot", () => {
    const state = createDemoState();
    const draft = structuredClone(state.pages[0]);
    draft.title = "New title";
    savePage(state, "creator-anna", draft);
    expect(state.publishedPages[0].title).not.toBe("New title");
    expect(() => savePage(state, "creator-anna", draft)).toThrow();
    publishPage(state, "creator-anna");
    expect(state.publishedPages[0].title).toBe("New title");
    state.pages[0].blocks[0].data.text = "unpublished secret";
    expect(JSON.stringify(state.publishedPages)).not.toContain("unpublished secret");
  });
  it("rejects another tenant, foreign item/asset references and duplicate block IDs", () => {
    const state = createDemoState();
    const draft = structuredClone(state.pages[0]);
    expect(() => savePage(state, "creator-other", draft)).toThrow();
    draft.blocks[0].data.itemIds = [state.items.find(i => i.ownerId === "creator-other")!.id];
    expect(() => savePage(state, "creator-anna", draft)).toThrow();
    draft.blocks[0].data = {};
    draft.blocks.push(structuredClone(draft.blocks[0]));
    expect(() => savePage(state, "creator-anna", draft)).toThrow();
  });
  it("archives removed sold blocks, preserving fulfilled grants and original content", () => {
    const state = createDemoState();
    const draft = structuredClone(state.pages[0]);
    state.entitlements.push({ id: "owned", ownerId: draft.ownerId, buyerId: "buyer-primary", pageId: draft.id, scope: "block", blockId: "anna-library", orderId: "order", status: "active", expiresAt: null, createdAt: draft.updatedAt });
    draft.blocks = draft.blocks.filter(b => b.id !== "anna-library");
    savePage(state, draft.ownerId, draft);
    expect(state.pages[0].blocks.find(b => b.id === "anna-library")?.archived).toBe(true);
    publishPage(state, draft.ownerId);
    expect(state.publishedPages[0].blocks.find(b => b.id === "anna-library")?.data.text).toBeTruthy();
  });
  it("preserves a block sold after its removal from the draft but before publication", () => {
    const state = createDemoState(); const draft = structuredClone(state.pages[0]);
    draft.blocks = draft.blocks.filter(b => b.id !== "anna-library");
    savePage(state, "creator-anna", draft);
    expect(state.pages[0].blocks.some(b => b.id === "anna-library")).toBe(false);
    state.entitlements.push({ id: "late-purchase", ownerId: "creator-anna", buyerId: "buyer-primary", pageId: "page-anna", blockId: "anna-library", scope: "block", orderId: "late-order", status: "active", expiresAt: null, createdAt: new Date().toISOString() });
    publishPage(state, "creator-anna");
    expect(state.publishedPages[0].blocks.find(b => b.id === "anna-library")).toMatchObject({ archived: true, hidden: false });
    expect(state.publishedPages[0].blocks.find(b => b.id === "anna-library")?.data.text).toContain("30");
  });
  it("normalizes contact email only inside its tenant and converts an opportunity once", () => {
    const state = createDemoState();
    const a = upsertContact(state, "creator-anna", " Buyer@Example.com ", "A");
    const b = upsertContact(state, "creator-other", "buyer@example.com", "B");
    expect(a.id).not.toBe(b.id);
    expect(upsertContact(state, "creator-anna", "buyer@example.com", "A2").id).toBe(a.id);
    expect(() => createOpportunity(state, { ownerId: "creator-anna", pageId: "page-anna", contactId: b.id, source: "form" })).toThrow();
    const opportunity = createOpportunity(state, { ownerId: "creator-anna", pageId: "page-anna", contactId: a.id, source: "booking" });
    markConverted(state, opportunity.id, "booked");
    const first = opportunity.convertedAt;
    markConverted(state, opportunity.id, "paid");
    expect(opportunity.convertedAt).toBe(first);
    expect(opportunity.status).toBe("paid");
  });
});

describe("metrics and rich text", () => {
  it("reports currencies separately and does not treat purchases or future events as activation", () => {
    const state = createDemoState(); const now = new Date("2026-09-02T12:00:00Z");
    state.users[0].createdAt = "2026-09-01T12:00:00Z";
    const base: Order = { id: "usd", ownerId: "creator-anna", buyerId: "buyer-primary", pageId: "page-anna", contactId: "seed-contact-0", opportunityId: "op", scope: "page", title: "Access", mode: "one_time", quantity: 1, amount: 2000, shippingAmount: 0, currency: "USD", status: "paid", fulfillment: "unfulfilled", createdAt: now.toISOString(), paidAt: now.toISOString(), expiresAt: now.toISOString(), test: false };
    state.orders = [base, { ...base, id: "eur", amount: 3000, currency: "EUR" }];
    expect(calculateMetrics(state, "creator-anna", now)).toMatchObject({ revenue: 0, revenueByCurrency: { USD: 2000, EUR: 3000 } });
    state.orders.push({ ...base, id: "sandbox", amount: 999999, commerce: { sandbox: true } } as Order);
    expect(calculateMetrics(state, "creator-anna", now)).toMatchObject({ revenue: 0, revenueByCurrency: { USD: 2000, EUR: 3000 } });
    state.opportunities.push({ id: "op", ownerId: "creator-anna", pageId: "page-anna", contactId: "seed-contact-0", source: "purchase", status: "paid", message: "", convertedAt: now.toISOString(), createdAt: now.toISOString(), test: false });
    state.analytics.push({ id: "future", ownerId: "creator-anna", pageId: "page-anna", visitorId: "future", kind: "payment_failed", createdAt: "2027-01-01T00:00:00Z", test: false });
    expect(diagnosticMetrics(state, "creator-anna", now)).toMatchObject({ activatedWithin24h: false, paymentFailures: 0 });
    state.bookings.push({ id: "booking", ownerId: "creator-anna", pageId: "page-anna", contactId: "seed-contact-0", opportunityId: "op", buyerId: "buyer-primary", title: "Call", startAt: "2026-09-03T12:00:00Z", endAt: "2026-09-03T13:00:00Z", timezone: "UTC", status: "confirmed", version: 1, createdAt: "2026-09-01T13:00:00Z", test: false });
    expect(diagnosticMetrics(state, "creator-anna", now).activatedWithin24h).toBe(true);
  });
  it("deduplicates visits and excludes owners/tests; booking plus payment is one conversion", () => {
    const state = createDemoState();
    state.analytics = []; state.opportunities = [];
    recordAnalytics(state, { pageId: "page-anna", kind: "view", visitorId: "visitor-123" }, undefined, false);
    recordAnalytics(state, { pageId: "page-anna", kind: "view", visitorId: "visitor-123" }, undefined, false);
    recordAnalytics(state, { pageId: "page-anna", kind: "view", visitorId: "owner-123" }, "creator-anna", false);
    recordAnalytics(state, { pageId: "page-anna", kind: "view", visitorId: "demo-1234" }, undefined, true);
    const contact = upsertContact(state, "creator-anna", "new@example.com", "New");
    const op = createOpportunity(state, { ownerId: "creator-anna", pageId: "page-anna", contactId: contact.id, source: "booking" });
    markConverted(state, op.id, "booked"); markConverted(state, op.id, "paid");
    const metrics = calculateMetrics(state, "creator-anna");
    expect(metrics.views).toBe(1); expect(metrics.conversions).toBe(1);
    expect(metrics.activePages).toBe(1); expect(metrics.northStar).toBe(1);
    expect(calculateMetrics(state, "creator-other").conversions).toBe(0);
  });
  it("preserves safe formatting but strips scripts, event handlers and dangerous URLs", () => {
    const safe = sanitizeRichText('<p>Hello <strong>world</strong><a href="javascript:alert(1)" onclick="alert(1)">bad</a><script>secret()</script><img src=x onerror=alert(1)><a href="https://example.com">good</a></p>');
    expect(safe).toContain("<strong>world</strong>"); expect(safe).toContain('href="https://example.com"');
    expect(safe).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
  });
});

describe("dashboard recipient Telegram status", () => {
  beforeEach(() => {
    vi.stubEnv("PAGER_DEMO", "false"); vi.stubEnv("PAGER_TELEGRAM_ENABLED", "true");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "424242:core_test_token"); vi.stubEnv("TELEGRAM_BOT_USERNAME", "pager_test_bot");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s".repeat(32)); vi.stubEnv("PAGER_INTEGRATION_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(() => vi.unstubAllEnvs());
  function pair(state: ReturnType<typeof createDemoState>, user: (typeof state.users)[number]) {
    const token = new URL(createTelegramPair(state, user).url).searchParams.get("start")!;
    expect(applyTelegramUpdate(state, { update_id: 1, message: { text: `/start ${token}`, chat: { id: 123456, type: "private" }, from: { id: 123456, is_bot: false } } })).toBe(true);
  }
  it("reports only the creator's completed recipient pairing and exposes no chat metadata", () => {
    const state = createDemoState(); const creator = state.users[0];
    pair(state, state.users[2]);
    expect(dashboardData(state, creator, false).integration.telegramConnected).toBe(false);
    createTelegramPair(state, creator);
    expect(dashboardData(state, creator, false).integration.telegramConnected).toBe(false);
    pair(state, creator);
    const data = dashboardData(state, creator, false);
    expect(data.integration).toEqual({ stripeConnected: false, stripeReady: false, calConnected: false, calLink: "", telegramConnected: true });
    expect(JSON.stringify(data)).not.toMatch(/chatId|telegramPair|recipientId|core_test_token/);
    disconnectTelegram(state, creator);
    expect(dashboardData(state, creator, false).integration.telegramConnected).toBe(false);
  });
  it("ignores legacy chat IDs, stale recipients, another bot and disabled/demo configuration", () => {
    const state = createDemoState(); const creator = state.users[0];
    state.integrations.push({ id: "legacy", ownerId: creator.id, telegramChatId: "123456", updatedAt: new Date().toISOString() });
    expect(dashboardData(state, creator, false).integration.telegramConnected).toBe(false);
    pair(state, creator);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "999999:other_bot");
    expect(dashboardData(state, creator, false).integration.telegramConnected).toBe(false);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "424242:core_test_token");
    creator.email = "changed@example.test";
    expect(dashboardData(state, creator, false).integration.telegramConnected).toBe(false);
    creator.email = "anna@example.test";
    vi.stubEnv("PAGER_TELEGRAM_ENABLED", "false");
    expect(dashboardData(state, creator, false).integration.telegramConnected).toBe(false);
    vi.stubEnv("PAGER_TELEGRAM_ENABLED", "true"); vi.stubEnv("PAGER_DEMO", "true");
    expect(dashboardData(state, creator, true).integration.telegramConnected).toBe(false);
  });
});
