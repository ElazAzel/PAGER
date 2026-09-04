import { describe, expect, it } from "vitest";
import type { DatabaseState, Order, CatalogItem, Booking } from "../src/lib/types";
import { applyCommerceEvent, reserveInventory, releaseInventory } from "../src/lib/integrations/transitions";
import { applyBookingUpdate, reminderAt, shouldDeliverBookingNotice } from "../src/lib/integrations/booking-transitions";

const now = "2026-09-02T12:00:00.000Z";
function fixture() {
  const state: DatabaseState = { users: [], pages: [], publishedPages: [], items: [], contacts: [], opportunities: [], bookings: [], orders: [], subscriptions: [], entitlements: [], timeline: [], integrations: [], analytics: [], assets: [], webhooks: [], notifications: [], adminAudit: [], creatorInvites: [] };
  const order: Order = { id: "o1", ownerId: "c1", buyerId: "b1", pageId: "p1", contactId: "ct1", opportunityId: "opp1", scope: "block", blockId: "block1", title: "Access", mode: "one_time", quantity: 1, amount: 1200, shippingAmount: 0, currency: "usd", status: "pending", fulfillment: "unfulfilled", expiresAt: "2026-09-02T13:00:00.000Z", createdAt: now, stripeAccountId: "acct_1", test: false };
  state.orders.push(order);
  return { state, order };
}
const event = (extra: Record<string, unknown> = {}) => ({ id: "evt1", provider: "stripe" as const, accountId: "acct_1", orderId: "o1", type: "paid" as const, paymentId: "pi1", amount: 1200, currency: "usd", at: now, ...extra });

describe("payment transitions", () => {
  it("creates exactly one order-linked grant on replay and different notifications of the same payment", () => {
    const { state, order } = fixture();
    applyCommerceEvent(state, event()); applyCommerceEvent(state, event()); applyCommerceEvent(state, event({ id: "evt2" }));
    expect(order.status).toBe("paid"); expect(state.entitlements).toHaveLength(1);
    expect(state.entitlements[0]).toMatchObject({ buyerId: "b1", orderId: "o1", scope: "block", blockId: "block1", status: "active" });
  });
  it("rejects wrong connected account, amount, currency, and demo impersonation before acknowledging the event", () => {
    for (const extra of [{ accountId: "acct_other" }, { amount: 1 }, { currency: "eur" }, { provider: "demo" }]) {
      const { state } = fixture();
      expect(() => applyCommerceEvent(state, event(extra))).toThrow();
      expect(state.entitlements).toHaveLength(0); expect(state.webhooks).toHaveLength(0);
    }
  });
  it("full refund preceding payment cannot resurrect the grant and does not revoke another order", () => {
    const { state } = fixture();
    state.entitlements.push({ id: "independent", orderId: "o2", buyerId: "b1", ownerId: "c1", pageId: "p1", scope: "block", blockId: "block1", status: "active", createdAt: now, expiresAt: null });
    applyCommerceEvent(state, event({ id: "refund", type: "refund", refundedAmount: 1200 }));
    applyCommerceEvent(state, event());
    expect(state.orders[0].status).toBe("refunded");
    expect(state.entitlements.find(e => e.orderId === "o1")?.status).toBe("revoked");
    expect(state.entitlements.find(e => e.id === "independent")?.status).toBe("active");
  });
  it("partial refunds preserve access; full cumulative refund revokes exactly once", () => {
    const { state } = fixture(); applyCommerceEvent(state, event());
    applyCommerceEvent(state, event({ id: "r1", type: "refund", refundedAmount: 300 }));
    expect(state.entitlements[0].status).toBe("active");
    applyCommerceEvent(state, event({ id: "r2", type: "refund", refundedAmount: 1200 }));
    applyCommerceEvent(state, event({ id: "r3", type: "refund", refundedAmount: 300 }));
    expect(state.entitlements[0].status).toBe("revoked");
  });
  it("won dispute restores a paid grant but a stale open event and refund cannot restore it", () => {
    const { state } = fixture(); applyCommerceEvent(state, event());
    applyCommerceEvent(state, event({ id: "d1", type: "dispute", dispute: "open", at: "2026-09-02T12:01:00Z" }));
    expect(state.entitlements[0].status).toBe("suspended");
    applyCommerceEvent(state, event({ id: "d2", type: "dispute", dispute: "won", at: "2026-09-02T12:02:00Z" }));
    applyCommerceEvent(state, event({ id: "d3", type: "dispute", dispute: "open", at: "2026-09-02T12:01:30Z" }));
    expect(state.entitlements[0].status).toBe("active");
    applyCommerceEvent(state, event({ id: "r", type: "refund", refundedAmount: 1200 }));
    applyCommerceEvent(state, event({ id: "d4", type: "dispute", dispute: "won", at: "2026-09-02T12:03:00Z" }));
    expect(state.entitlements[0].status).toBe("revoked");
  });
  it("out-of-order paid invoices never shorten access; refund only revokes its invoice", () => {
    const { state, order } = fixture(); order.mode = "monthly";
    const monthly = { subscriptionId: "sub_1", periodStart: now, paidThrough: "2026-10-02T12:00:00.000Z" };
    applyCommerceEvent(state, event({ ...monthly, id: "inv2", paymentId: "pi2", paidThrough: "2026-11-02T12:00:00.000Z" }));
    applyCommerceEvent(state, event({ ...monthly, id: "inv1" }));
    expect(state.subscriptions[0].paidThrough).toBe("2026-11-02T12:00:00.000Z");
    applyCommerceEvent(state, event({ ...monthly, type: "refund", id: "ref1", refundedAmount: 1200 }));
    expect(state.entitlements.filter(e => e.status === "active")).toHaveLength(1);
    expect(state.subscriptions[0].paidThrough).toBe("2026-11-02T12:00:00.000Z");
  });
  it("cancel-at-period-end preserves paid time and a stale active event cannot undo terminal cancellation", () => {
    const { state, order } = fixture(); order.mode = "monthly";
    applyCommerceEvent(state, event({ subscriptionId: "sub_1", paidThrough: "2026-10-02T12:00:00.000Z" }));
    applyCommerceEvent(state, event({ id: "cancel", type: "subscription", subscriptionId: "sub_1", subscriptionStatus: "cancelled", cancelAtPeriodEnd: true, at: "2026-09-02T12:02:00Z" }));
    applyCommerceEvent(state, event({ id: "active", type: "subscription", subscriptionId: "sub_1", subscriptionStatus: "active", at: now }));
    expect(state.subscriptions[0].status).toBe("cancelled"); expect(state.entitlements[0].status).toBe("active");
  });
});

describe("inventory", () => {
  function stocked() {
    const f = fixture(); f.order.scope = "item"; f.order.itemId = "i1";
    const item: CatalogItem = { id: "i1", ownerId: "c1", pageId: "p1", title: "Last ticket", description: "", kind: "ticket", price: 1200, currency: "usd", stock: 1, reserved: 0, shipping: [], createdAt: now };
    f.state.items.push(item); return { ...f, item };
  }
  it("two simultaneous contenders for the last unit cannot both reserve inside the store transaction", async () => {
    const { state, order, item } = stocked(); const other = { ...order, id: "o2" }; state.orders.push(other);
    const results = await Promise.allSettled([Promise.resolve().then(() => reserveInventory(state, order)), Promise.resolve().then(() => reserveInventory(state, other))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(item.reserved).toBe(1);
  });
  it("expiry/failure replays release once; duplicate paid events consume stock once", () => {
    const { state, order, item } = stocked(); reserveInventory(state, order); releaseInventory(state, order); releaseInventory(state, order);
    expect(item.reserved).toBe(0); expect(item.stock).toBe(1);
    const replacement = { ...order, id: "o2", commerce: undefined }; state.orders.push(replacement); reserveInventory(state, replacement);
    applyCommerceEvent(state, event({ orderId: "o2" })); applyCommerceEvent(state, event({ id: "dup", orderId: "o2" }));
    applyCommerceEvent(state, event({ id: "expired", orderId: "o2", type: "expired" }));
    expect(item.stock).toBe(0); expect(item.reserved).toBe(0); expect(replacement.status).toBe("paid");
  });
  it("late payment cannot steal another buyer's reservation after expiry", () => {
    const { state, order, item } = stocked(); reserveInventory(state, order); releaseInventory(state, order);
    const other = { ...order, id: "o2", commerce: undefined }; state.orders.push(other); reserveInventory(state, other);
    applyCommerceEvent(state, event());
    expect(item.stock).toBe(1); expect(item.reserved).toBe(1);
    expect(state.entitlements.filter(e => e.orderId === "o1" && e.status === "active")).toHaveLength(0);
  });
});

describe("booking versions and reminders", () => {
  const booking = (): Booking => ({ id: "bk1", ownerId: "c1", pageId: "p1", buyerId: "b1", contactId: "ct1", opportunityId: "opp1", title: "Call", startAt: "2026-09-04T12:00:00Z", endAt: "2026-09-04T13:00:00Z", timezone: "Asia/Almaty", status: "confirmed", version: 1, createdAt: now, test: false });
  it("skips reminders in the past including bookings under 24 hours away", () => {
    expect(reminderAt("2026-09-03T11:59:00Z", now)).toBeNull();
    expect(reminderAt("2026-09-04T12:00:00Z", now)).toBe("2026-09-03T12:00:00.000Z");
  });
  it("reschedule and cancellation invalidate queued versions; stale provider events cannot resurrect cancelled booking", () => {
    const b = booking();
    applyBookingUpdate(b, { id: "reschedule", at: "2026-09-02T13:00:00Z", status: "confirmed", startAt: "2026-09-05T12:00:00Z", endAt: "2026-09-05T13:00:00Z" });
    expect(shouldDeliverBookingNotice(b, 1)).toBe(false); expect(shouldDeliverBookingNotice(b, 2)).toBe(true);
    applyBookingUpdate(b, { id: "cancel", at: "2026-09-02T14:00:00Z", status: "cancelled" });
    applyBookingUpdate(b, { id: "old", at: "2026-09-02T12:30:00Z", status: "confirmed" });
    expect(b.status).toBe("cancelled"); expect(shouldDeliverBookingNotice(b, 2)).toBe(false);
  });
});
