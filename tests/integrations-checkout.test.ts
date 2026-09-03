import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoState } from "../src/lib/server/seed";
import { FileRepository } from "../src/lib/db/file-repository";
import { prepareOrder, demoTransition } from "../src/lib/integrations/checkout";
import { ownedOrder } from "../src/lib/integrations/runtime";
import { orderMeta } from "../src/lib/integrations/model";

afterEach(() => vi.unstubAllEnvs());
function setup() {
  const state = createDemoState(); const buyer = state.users.find(u => u.role === "buyer")!; const other = state.users.filter(u => u.role === "buyer")[1];
  const page = state.publishedPages[0]; const item = state.items.find(i => i.pageId === page.id && i.kind === "physical")!;
  page.paid = false; item.stock = 1; item.reserved = 0;
  const block = page.blocks.find(b => b.data.itemIds?.includes(item.id))!; block.paid = false; block.hidden = false; block.archived = false;
  const shipping = item.shipping[0];
  const input = { pageId: page.id, scope: "item" as const, mode: "one_time" as const, itemId: item.id, blockId: block.id, quantity: 1, shippingAddress: { name: "Buyer", line1: "1 Road", city: "City", postalCode: "12345", country: shipping.country } };
  return { state, buyer, other, page, item, block, input };
}
describe("checkout and transaction boundaries", () => {
  it("uses server price and shipping rules; cross-tenant and gated item access is denied", () => {
    const { state, buyer, page, item, block, input } = setup();
    expect(() => prepareOrder(state, buyer, { ...input, shippingAddress: { ...input.shippingAddress, country: "ZZ" } }, true)).toThrow();
    block.paid = true;
    expect(() => prepareOrder(state, buyer, input, true)).toThrow();
    block.paid = false;
    const order = prepareOrder(state, buyer, input, true);
    expect(order.amount).toBe(item.price); expect(order.shippingAmount).toBe(item.shipping[0].amount); expect(order.ownerId).toBe(page.ownerId);
    expect(() => prepareOrder(state, buyer, { ...input, pageId: "other-page" }, true)).toThrow();
  });
  it("buyer purchase lookup cannot enumerate another buyer's order", () => {
    vi.stubEnv("PAGER_DEMO", "true"); const { state, buyer, other, input } = setup(); const order = prepareOrder(state, buyer, input, true);
    expect(ownedOrder(state, order.id, buyer).id).toBe(order.id);
    expect(() => ownedOrder(state, order.id, other)).toThrow();
    demoTransition(state, order, "pay"); demoTransition(state, order, "pay");
    expect(state.entitlements.filter(e => e.orderId === order.id)).toHaveLength(1);
  });
  it("separate repository instances serialize the simultaneous last-unit checkout", async () => {
    const { state, buyer, other, input } = setup(); const dir = await mkdtemp(path.join(os.tmpdir(), "pager-integration-inventory-"));
    try {
      const left = new FileRepository(dir, () => structuredClone(state)); const right = new FileRepository(dir, () => structuredClone(state));
      const results = await Promise.allSettled([left.mutate(s => prepareOrder(s, buyer, input, true)), right.mutate(s => prepareOrder(s, other, input, true))]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const saved = await left.read(); expect(saved.items.find(i => i.id === input.itemId)?.reserved).toBe(1);
      const orders = saved.orders.filter(o => o.itemId === input.itemId && o.status === "pending"); expect(orders).toHaveLength(1);
      await right.mutate(s => { const order = s.orders.find(o => o.id === orders[0].id)!; demoTransition(s, order, "cancel"); demoTransition(s, order, "cancel"); });
      expect((await left.read()).items.find(i => i.id === input.itemId)?.reserved).toBe(0);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("Stripe sandbox uses real provider identifiers but excludes the opportunity from production KPIs", () => {
    vi.stubEnv("PAGER_STRIPE_LIVE", "false"); const { state, buyer, page, input } = setup();
    state.integrations.push({ id: "integration", ownerId: page.ownerId, stripeAccountId: "acct_test", stripeReady: true, updatedAt: new Date().toISOString() });
    const order = prepareOrder(state, buyer, input, false);
    expect(order.test).toBe(false); expect(order.stripeAccountId).toBe("acct_test"); expect(orderMeta(order).sandbox).toBe(true);
    expect(state.opportunities.find(o => o.id === order.opportunityId)?.test).toBe(true);
  });
  it("cannot create competing one-time and monthly checkouts for the same access", () => {
    const { state, buyer, page } = setup(); const block = page.blocks.find(b => b.paid)!;
    prepareOrder(state, buyer, { pageId: page.id, scope: "block", blockId: block.id, mode: "one_time" }, true);
    expect(() => prepareOrder(state, buyer, { pageId: page.id, scope: "block", blockId: block.id, mode: "monthly" }, true)).toThrow();
  });
  it("a booking cannot be attached to a page-access purchase", () => {
    const { state, buyer, page } = setup(); page.paid = true;
    expect(() => prepareOrder(state, buyer, { pageId: page.id, scope: "page", mode: "one_time", bookingId: "unrelated" }, true)).toThrow();
  });
});
