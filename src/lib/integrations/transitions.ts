import type { DatabaseState, Order } from "../types";
import { orderMeta, type CommerceSubscription, type PaymentFact } from "./model";
import { IntegrationError } from "./security";
export type CommerceEvent = { id: string; provider: "stripe" | "demo"; accountId?: string; orderId: string; type: "paid" | "expired" | "failed" | "refund" | "dispute" | "subscription"; at: string; paymentId?: string; amount?: number; currency?: string; refundedAmount?: number; dispute?: "open" | "won" | "lost"; subscriptionId?: string; periodStart?: string; paidThrough?: string; subscriptionStatus?: "active" | "past_due" | "cancelled"; cancelAtPeriodEnd?: boolean };
function inventoryItem(state: DatabaseState, order: Order) {
  if (!order.itemId) return undefined;
  const item = state.items.find(i => i.id === order.itemId && i.ownerId === order.ownerId && i.pageId === order.pageId);
  if (!item) throw new IntegrationError(409, "Order item unavailable");
  return item.stock !== null ? item : undefined;
}
// Caller MUST hold mutateState's transaction. The reservation and order are persisted together.
export function reserveInventory(state: DatabaseState, order: Order): void {
  if (!Number.isSafeInteger(order.quantity) || order.quantity <= 0) throw new IntegrationError(400, "Invalid quantity");
  const item = inventoryItem(state, order); if (!item) return;
  const meta = orderMeta(order); if (meta.inventory === "reserved" || meta.inventory === "sold") return;
  if (item.stock! - item.reserved < order.quantity) throw new IntegrationError(409, "Insufficient stock");
  item.reserved += order.quantity; meta.inventory = "reserved";
}
export function releaseInventory(state: DatabaseState, order: Order): void {
  const meta = orderMeta(order); if (meta.inventory !== "reserved") return;
  const item = inventoryItem(state, order);
  if (item) { if (item.reserved < order.quantity) throw new IntegrationError(409, "Inventory reservation invariant violated"); item.reserved -= order.quantity; }
  meta.inventory = "released";
}
function sellInventory(state: DatabaseState, order: Order): void {
  const meta = orderMeta(order); const item = inventoryItem(state, order); if (!item || meta.inventory === "sold") return;
  if (meta.inventory !== "reserved" && item.stock! - item.reserved < order.quantity) {
    meta.inventoryShortfall = true; return; // Paid funds are recorded, but no goods/access promised. Reconciler refunds.
  }
  if (meta.inventory === "reserved") {
    if (item.reserved < order.quantity || item.stock! < order.quantity) throw new IntegrationError(409, "Inventory reservation invariant violated");
    item.reserved -= order.quantity;
  }
  item.stock! -= order.quantity; meta.inventory = "sold"; meta.inventoryShortfall = false;
}
function upsertSubscription(state: DatabaseState, order: Order, event: CommerceEvent): CommerceSubscription {
  if (order.scope === "item" || !event.subscriptionId) throw new IntegrationError(400, "Missing access subscription");
  const id = `subscription:${order.id}`;
  let sub = state.subscriptions.find(s => s.id === id) as CommerceSubscription | undefined;
  if (sub?.stripeId && sub.stripeId !== event.subscriptionId) throw new IntegrationError(409, "Subscription identity mismatch");
  if (!sub) {
    sub = { id, ownerId: order.ownerId, buyerId: order.buyerId, pageId: order.pageId, blockId: order.blockId, scope: order.scope, orderId: order.id, status: "past_due", paidThrough: new Date(0).toISOString(), cancelAtPeriodEnd: false, stripeId: event.provider === "stripe" ? event.subscriptionId : undefined, stripeAccountId: order.stripeAccountId, updatedAt: event.at };
    state.subscriptions.push(sub);
  }
  order.subscriptionId = id; return sub;
}
function syncGrants(state: DatabaseState, order: Order): void {
  const meta = orderMeta(order); const payments = Object.values(meta.payments ?? {});
  for (const payment of payments) {
    if (!payment.paid) continue;
    const id = `grant:${order.id}:${payment.id}`;
    let grant = state.entitlements.find(e => e.id === id);
    if (!grant) {
      grant = { id, ownerId: order.ownerId, buyerId: order.buyerId, pageId: order.pageId, blockId: order.scope === "block" ? order.blockId : undefined, itemId: order.scope === "item" ? order.itemId : undefined, scope: order.scope, orderId: order.id, subscriptionId: order.subscriptionId, status: "active", expiresAt: order.mode === "monthly" ? payment.paidThrough! : null, createdAt: payment.paidAt! };
      state.entitlements.push(grant);
    }
    grant.status = payment.refundedAmount >= payment.amount || payment.dispute === "lost" || meta.inventoryShortfall ? "revoked" : payment.dispute === "open" ? "suspended" : "active";
    grant.expiresAt = order.mode === "monthly" ? payment.paidThrough! : null;
  }
  const sub = state.subscriptions.find(s => s.id === order.subscriptionId) as CommerceSubscription | undefined;
  if (sub) {
    const ends = state.entitlements.filter(e => e.subscriptionId === sub.id && e.status === "active" && e.expiresAt).map(e => Date.parse(e.expiresAt!));
    sub.paidThrough = new Date(Math.max(0, ...ends)).toISOString();
    if (!sub.commerce?.terminal && Date.parse(sub.paidThrough) > Date.parse(sub.updatedAt)) sub.status = "active";
  }
  const latest = payments.filter(p => p.paid).sort((a, b) => Date.parse(b.paidThrough ?? b.paidAt!) - Date.parse(a.paidThrough ?? a.paidAt!))[0];
  if (latest) order.status = latest.refundedAmount >= latest.amount ? "refunded" : latest.dispute === "open" || latest.dispute === "lost" ? "disputed" : "paid";
}
export function applyCommerceEvent(state: DatabaseState, event: CommerceEvent): Order {
  const order = state.orders.find(o => o.id === event.orderId);
  if (!order) throw new IntegrationError(404, "Order not found");
  if (event.provider === "demo" ? !order.test : order.test || !event.accountId || order.stripeAccountId !== event.accountId) throw new IntegrationError(403, "Provider/account does not own this order");
  if (!event.id || !Number.isFinite(Date.parse(event.at))) throw new IntegrationError(400, "Invalid event identity or timestamp");
  const eventId = `${event.provider}:${event.accountId ?? "local"}:${event.id}`;
  if (state.webhooks.some(e => e.id === eventId)) return order;
  const meta = orderMeta(order);
  if (["paid", "refund", "dispute"].includes(event.type)) {
    if (!event.paymentId || !Number.isSafeInteger(event.amount) || event.amount !== order.amount + order.shippingAmount || event.currency?.toLowerCase() !== order.currency.toLowerCase()) throw new IntegrationError(400, "Payment identity, amount or currency mismatch");
    if (event.type === "paid" && order.mode === "monthly" && (!event.subscriptionId || !event.paidThrough || !Number.isFinite(Date.parse(event.paidThrough)))) throw new IntegrationError(400, "Paid invoice period required");
    if (event.type === "refund" && (!Number.isSafeInteger(event.refundedAmount) || event.refundedAmount! < 0 || event.refundedAmount! > event.amount!)) throw new IntegrationError(400, "Invalid cumulative refund amount");
    if (event.type === "dispute" && !["open", "won", "lost"].includes(event.dispute ?? "")) throw new IntegrationError(400, "Invalid dispute");
    const payments = meta.payments ??= {};
    const payment: PaymentFact = payments[event.paymentId] ??= { id: event.paymentId, amount: event.amount!, currency: event.currency!, paid: false, refundedAmount: 0 };
    if (event.type === "paid") {
      if (order.mode === "monthly") upsertSubscription(state, order, event);
      if (!payment.paid) {
        sellInventory(state, order); payment.paid = true; payment.paidAt = event.at;
        payment.periodStart = event.periodStart; payment.paidThrough = event.paidThrough;
        order.paidAt ??= event.at; order.stripePaymentId ??= event.provider === "stripe" ? event.paymentId : undefined;
      }
    } else if (event.type === "refund") payment.refundedAmount = Math.max(payment.refundedAmount, event.refundedAmount!);
    else if (!payment.disputeAt || Date.parse(event.at) >= Date.parse(payment.disputeAt)) {
      // A closed dispute is terminal even when Stripe delivers an older open event with the same timestamp.
      if (!payment.dispute || payment.dispute === "open" || event.dispute !== "open") { payment.dispute = event.dispute; payment.disputeAt = event.at; }
    }
    syncGrants(state, order);
  } else if (event.type === "expired" || event.type === "failed") {
    if (!Object.values(meta.payments ?? {}).some(p => p.paid)) { releaseInventory(state, order); order.status = event.type; }
  } else if (event.type === "subscription") {
    const sub = upsertSubscription(state, order, event); const subMeta = sub.commerce ??= {};
    if (!subMeta.providerAt || Date.parse(event.at) >= Date.parse(subMeta.providerAt)) {
      if (!subMeta.terminal) { sub.status = event.subscriptionStatus ?? sub.status; sub.cancelAtPeriodEnd = event.cancelAtPeriodEnd ?? sub.cancelAtPeriodEnd; }
      if (event.subscriptionStatus === "cancelled") { sub.status = "cancelled"; subMeta.terminal = true; }
      subMeta.providerAt = event.at; sub.updatedAt = event.at;
    }
  }
  state.webhooks.push({ id: eventId, provider: event.provider === "demo" ? "stripe" : event.provider, processedAt: new Date().toISOString() });
  return order;
}
