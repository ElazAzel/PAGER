import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Booking, CheckoutInput, DatabaseState, Order, User } from "../types";
import { canAccessBlock, canAccessItem } from "../server/access";
import { addTimeline, createOpportunity, upsertContact } from "../server/crm";
import { isDemoMode, mutateState } from "../server/store";
import { applyCommerceEvent, reserveInventory } from "./transitions";
import { orderMeta } from "./model";
import { IntegrationError } from "./security";
import { createStripeCheckout } from "./stripe";
import { assertPageAvailable, assertPaymentsEnabled } from "../server/capabilities";

const addressSchema = z.object({ name: z.string().trim().min(1).max(200), line1: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(100), postalCode: z.string().trim().min(1).max(32), country: z.string().regex(/^[A-Z]{2}$/) }).strict();
export const checkoutSchema = z.object({ pageId: z.string().min(1).max(200), scope: z.enum(["page", "block", "item"]), blockId: z.string().max(200).optional(), itemId: z.string().max(200).optional(), bookingId: z.string().max(200).optional(), mode: z.enum(["one_time", "monthly"]), quantity: z.number().int().min(1).max(100).default(1), country: z.string().regex(/^[A-Z]{2}$/).optional(), shippingAddress: addressSchema.optional() }).strict();
function validGrant(state: DatabaseState, order: Pick<Order, "buyerId" | "pageId" | "scope" | "blockId" | "itemId">, now: number) {
  return state.entitlements.some(e => e.buyerId === order.buyerId && e.pageId === order.pageId && e.status === "active" && (!e.expiresAt || Date.parse(e.expiresAt) > now) && (order.scope === "page" ? e.scope === "page" : order.scope === "block" ? e.scope === "page" || e.scope === "block" && e.blockId === order.blockId : e.scope === "item" && e.itemId === order.itemId));
}
// Used by HTTP checkout and Cal booking import, always within the core store transaction.
export function prepareOrder(state: DatabaseState, user: User, input: CheckoutInput, demo: boolean, now = new Date()): Order {
  if (input.bookingId && input.scope !== "item") throw new IntegrationError(400, "Only service orders can reference a booking");
  if (demo) for (const expired of state.orders.filter(o => o.test && o.status === "pending" && Date.parse(o.expiresAt) <= now.getTime())) applyCommerceEvent(state, { id: `expire:${expired.id}`, provider: "demo", orderId: expired.id, type: "expired", at: now.toISOString() });
  const page = state.publishedPages.find(p => p.id === input.pageId && p.publishedAt);
  if (!page) throw new IntegrationError(404, "Published page not found");
  assertPageAvailable(page);
  if (page.ownerId === user.id) throw new IntegrationError(409, "Creators cannot purchase their own page");
  let title = page.title; let unitAmount: number | undefined; let currency = page.pricing.currency.toLowerCase(); let quantity = input.quantity ?? 1; let shippingAmount = 0;
  let itemId: string | undefined; let blockId: string | undefined;
  if (input.scope !== "item" && quantity !== 1) throw new IntegrationError(400, "Access quantity must be one");
  if (input.scope === "page") { if (!page.paid) throw new IntegrationError(409, "Page is free"); unitAmount = input.mode === "monthly" ? page.pricing.monthly : page.pricing.oneTime; }
  else if (input.scope === "block") {
    const block = page.blocks.find(b => b.id === input.blockId && !b.hidden && !b.archived);
    if (!block || !block.paid) throw new IntegrationError(404, "Paid block not found");
    // A block purchase cannot bypass a whole-page gate.
    if (page.paid && !canAccessBlock(page, { ...block, paid: false }, user.id, state.entitlements)) throw new IntegrationError(403, "Page access is required first");
    blockId = block.id; title = block.teaser || page.title; currency = block.pricing.currency.toLowerCase(); unitAmount = input.mode === "monthly" ? block.pricing.monthly : block.pricing.oneTime;
  } else {
    const item = state.items.find(i => i.id === input.itemId && i.pageId === page.id && i.ownerId === page.ownerId);
    if (!item || !input.blockId || !canAccessItem(state, item, user.id, input.blockId)) throw new IntegrationError(403, "Item is unavailable from this block");
    if (input.mode !== "one_time") throw new IntegrationError(400, "Items support one-time payment only");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw new IntegrationError(400, "Invalid quantity");
    if (item.kind === "digital" || item.kind === "service") { if (quantity !== 1) throw new IntegrationError(400, "This item requires quantity one"); quantity = 1; }
    itemId = item.id; blockId = input.blockId; title = item.title; unitAmount = item.price; currency = item.currency.toLowerCase();
    if (item.kind === "service" && !input.bookingId) throw new IntegrationError(409, "Book the service before paying");
    if (item.kind === "physical") {
      const country = input.shippingAddress?.country;
      const shipping = item.shipping.find(s => s.country === country);
      if (!input.shippingAddress || !shipping || (input.country && input.country !== country)) throw new IntegrationError(400, "A shipping address in an allowed country is required");
      shippingAmount = shipping.amount;
    }
  }
  if (!["usd", "eur", "gbp"].includes(currency) || !Number.isSafeInteger(unitAmount) || unitAmount! <= 0 || !Number.isSafeInteger(shippingAmount) || shippingAmount < 0 || !Number.isSafeInteger(unitAmount! * quantity + shippingAmount)) throw new IntegrationError(400, "Invalid or unavailable price");
  const target = { buyerId: user.id, pageId: page.id, scope: input.scope, blockId, itemId };
  const item = itemId ? state.items.find(i => i.id === itemId) : undefined;
  if ((input.scope !== "item" || item?.kind === "digital") && validGrant(state, target, now.getTime())) throw new IntegrationError(409, "This resource is already owned");
  let booking: Booking | undefined;
  if (input.bookingId) {
    booking = state.bookings.find(b => b.id === input.bookingId && b.ownerId === page.ownerId && b.pageId === page.id && b.itemId === itemId && b.status === "confirmed" && b.test === demo);
    const email = booking && state.contacts.find(c => c.id === booking!.contactId && c.ownerId === page.ownerId)?.email;
    if (!booking || (booking.buyerId !== user.id && (booking.buyerId || email?.toLowerCase() !== user.email.toLowerCase()))) throw new IntegrationError(403, "Booking is not owned by this buyer");
    booking.buyerId = user.id;
    if (state.orders.some(o => o.bookingId === booking!.id && o.status === "paid")) throw new IntegrationError(409, "Booking is already paid");
  }
  const pending = state.orders.find(o => o.buyerId === user.id && o.pageId === page.id && o.scope === input.scope && o.itemId === itemId && (input.scope === "item" || o.blockId === blockId) && o.bookingId === input.bookingId && o.status === "pending" && o.test === demo);
  if (pending) {
    if (pending.mode !== input.mode) throw new IntegrationError(409, "Complete or cancel the existing access checkout first");
    if (pending.quantity !== quantity || JSON.stringify(pending.shippingAddress) !== JSON.stringify(input.shippingAddress)) throw new IntegrationError(409, "Complete or cancel the existing checkout first");
    return pending;
  }
  const integration = state.integrations.find(i => i.ownerId === page.ownerId);
  if (!demo && (!integration?.stripeAccountId || !integration.stripeReady)) throw new IntegrationError(503, "Creator Stripe account is not ready");
  const contact = upsertContact(state, page.ownerId, user.email, user.name);
  const sandbox = !demo && process.env.PAGER_STRIPE_LIVE !== "true";
  const opportunity = booking ? undefined : createOpportunity(state, { ownerId: page.ownerId, pageId: page.id, contactId: contact.id, source: "purchase", test: demo || sandbox });
  if (booking && sandbox) { const sourceOpportunity = state.opportunities.find(o => o.id === booking.opportunityId); if (sourceOpportunity) sourceOpportunity.test = true; }
  const order: Order = { id: randomUUID(), ownerId: page.ownerId, pageId: page.id, buyerId: user.id, contactId: contact.id, opportunityId: booking?.opportunityId ?? opportunity!.id, itemId, blockId, bookingId: booking?.id, scope: input.scope, title, mode: input.mode, quantity, amount: unitAmount! * quantity, shippingAmount, currency, status: "pending", fulfillment: "unfulfilled", shippingAddress: input.shippingAddress, stripeAccountId: demo ? undefined : integration!.stripeAccountId, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 31 * 60_000).toISOString(), test: demo };
  orderMeta(order).sandbox = sandbox;
  reserveInventory(state, order); state.orders.push(order);
  addTimeline(state, { ownerId: page.ownerId, contactId: contact.id, kind: "order_pending", title: demo ? "DEMO: pending order" : "Order awaiting payment", referenceId: order.id });
  return order;
}
export async function checkout(user: User, input: CheckoutInput): Promise<{ url: string; orderId: string; demo: boolean }> {
  assertPaymentsEnabled();
  const demo = isDemoMode(); const order = await mutateState(s => prepareOrder(s, user, input, demo));
  if (demo) return { url: `/checkout/${order.id}`, orderId: order.id, demo: true };
  if (orderMeta(order).checkoutUrl) return { url: orderMeta(order).checkoutUrl!, orderId: order.id, demo: false };
  // Stripe idempotency key is the persisted order ID. Network ambiguity never frees a possibly-paid reservation.
  let session;
  try { session = await createStripeCheckout(order, user); }
  catch (error) { await mutateState(state => { const current = state.orders.find(o => o.id === order.id); if (current) orderMeta(current).checkoutError = "Stripe Checkout creation failed or result is uncertain; reservation kept for reconciliation"; }); throw error; }
  await mutateState(state => { const current = state.orders.find(o => o.id === order.id)!; current.stripeSessionId = session.id; current.expiresAt = new Date(session.expires_at * 1000).toISOString(); orderMeta(current).checkoutUrl = session.url!; });
  return { url: session.url!, orderId: order.id, demo: false };
}
export function demoTransition(state: DatabaseState, order: Order, action: "pay" | "cancel"): Order {
  if (!order.test) throw new IntegrationError(403, "Demo action cannot update a real order");
  if (action === "pay" && Date.parse(order.expiresAt) <= Date.now() && order.status === "pending") {
    applyCommerceEvent(state, { id: `expire:${order.id}`, provider: "demo", orderId: order.id, type: "expired", at: new Date().toISOString() });
    return order;
  }
  if (action === "pay" && ["expired", "failed"].includes(order.status)) throw new IntegrationError(409, "Demo checkout is no longer payable");
  const now = new Date(); const end = new Date(now); end.setUTCMonth(end.getUTCMonth() + 1);
  return applyCommerceEvent(state, { id: `${action}:${order.id}`, provider: "demo", orderId: order.id, type: action === "pay" ? "paid" : "expired", at: now.toISOString(), paymentId: `demo:${order.id}`, amount: order.amount + order.shippingAmount, currency: order.currency, subscriptionId: order.mode === "monthly" ? `demo-sub:${order.id}` : undefined, paidThrough: order.mode === "monthly" ? end.toISOString() : undefined });
}
