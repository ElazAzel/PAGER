import "server-only";
import Stripe from "stripe";
import type { Order, User } from "../types";
import { IntegrationError } from "./security";
import { appOrigin, env } from "./runtime";
import { readState, mutateState, isDemoMode } from "../server/store";
import { addTimeline, markConverted } from "../server/crm";
import { applyCommerceEvent, type CommerceEvent } from "./transitions";
import { orderMeta } from "./model";

export function stripeClient(): Stripe {
  if (isDemoMode()) throw new IntegrationError(409, "Stripe is disabled in local demo mode");
  return new Stripe(env("STRIPE_SECRET_KEY"), { maxNetworkRetries: 2, timeout: 20_000 });
}
export function verifyStripeWebhook(raw: string, signature: string | null, secret: string, live: boolean): Stripe.Event {
  if (!signature) throw new IntegrationError(400, "Stripe signature required");
  let event: Stripe.Event;
  try { event = Stripe.webhooks.constructEvent(raw, signature, secret, 300); } catch { throw new IntegrationError(400, "Invalid Stripe webhook signature"); }
  if (event.livemode !== live) throw new IntegrationError(400, "Stripe webhook mode mismatch");
  return event;
}
export function checkoutParameters(order: Order, user: User, origin: string): Stripe.Checkout.SessionCreateParams {
  const metadata = { pagerOrderId: order.id, pagerOwnerId: order.ownerId, pagerBuyerId: order.buyerId };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: order.mode === "monthly" ? "subscription" : "payment", customer_email: user.email, client_reference_id: order.id, metadata,
    // Card-only MVP avoids delayed methods consuming stock after Checkout expires.
    payment_method_types: ["card"], expires_at: Math.floor(Date.parse(order.expiresAt) / 1000),
    success_url: `${origin}/purchases?order=${encodeURIComponent(order.id)}`, cancel_url: `${origin}/checkout/${encodeURIComponent(order.id)}?cancelled=1`,
    line_items: [{ quantity: order.quantity, price_data: { currency: order.currency, unit_amount: order.amount / order.quantity, product_data: { name: order.title }, ...(order.mode === "monthly" ? { recurring: { interval: "month" as const } } : {}) } }],
    locale: user.locale === "ru" ? "ru" : "en", automatic_tax: { enabled: false }, allow_promotion_codes: false,
  };
  if (order.mode === "monthly") params.subscription_data = { metadata, application_fee_percent: 0 };
  else params.payment_intent_data = { metadata, application_fee_amount: 0 };
  if (order.shippingAmount) params.line_items!.push({ quantity: 1, price_data: { currency: order.currency, unit_amount: order.shippingAmount, product_data: { name: user.locale === "ru" ? "Доставка" : "Shipping" } } });
  // The validated address is snapshotted on the order. Checkout cannot select a different shipping price.
  return params;
}
export async function createStripeCheckout(order: Order, user: User): Promise<Stripe.Checkout.Session> {
  if (!order.stripeAccountId) throw new IntegrationError(503, "Connected Stripe account required");
  const session = await stripeClient().checkout.sessions.create(checkoutParameters(order, user, appOrigin()), { stripeAccount: order.stripeAccountId, idempotencyKey: `pager-checkout-${order.id}` });
  if (!session.url) throw new IntegrationError(502, "Stripe did not return a Checkout URL");
  return session;
}

type Obj = Record<string, unknown>;
function obj(value: unknown): Obj { return value !== null && typeof value === "object" ? value as Obj : {}; }
function str(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function id(value: unknown): string | undefined { return str(value) ?? str(obj(value).id); }
function seconds(value: unknown): string | undefined { return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : undefined; }
function subscriptionId(invoice: Obj): string | undefined { return id(invoice.subscription) ?? id(obj(obj(invoice.parent).subscription_details).subscription); }

export async function commitCommerce(event: CommerceEvent): Promise<Order> {
  return mutateState(state => {
    const before = state.orders.find(o => o.id === event.orderId); const wasPaid = before?.paidAt;
    const processed = state.webhooks.length; const order = applyCommerceEvent(state, event);
    if (state.webhooks.length !== processed) {
      if (order.paidAt && !wasPaid) {
        markConverted(state, order.opportunityId, "paid");
        addTimeline(state, { ownerId: order.ownerId, contactId: order.contactId, kind: "payment_paid", title: order.test ? "DEMO: payment confirmed" : "Payment confirmed", referenceId: order.id });
      }
      if (event.type === "failed" || orderMeta(order).inventoryShortfall) state.analytics.push({ id: `payment-failure:${event.id}`, ownerId: order.ownerId, pageId: order.pageId, kind: "payment_failed", visitorId: order.buyerId, createdAt: event.at, test: order.test || process.env.PAGER_STRIPE_LIVE !== "true" });
      if (event.type === "refund" || event.type === "dispute") addTimeline(state, { ownerId: order.ownerId, contactId: order.contactId, kind: event.type, title: event.type === "refund" ? "Payment refund updated" : "Payment dispute updated", referenceId: order.id });
    }
    return order;
  });
}
async function paymentOrder(paymentId: string, account: string, client: Stripe): Promise<string | undefined> {
  const intent = await client.paymentIntents.retrieve(paymentId, {}, { stripeAccount: account });
  if (intent.metadata.pagerOrderId) return intent.metadata.pagerOrderId;
  // Subscription PaymentIntents do not inherit subscription metadata. Consult their charge's invoice.
  const chargeId = id(intent.latest_charge);
  if (chargeId) {
    const charge = obj(await client.charges.retrieve(chargeId, {}, { stripeAccount: account }));
    const invoiceId = id(charge.invoice);
    if (invoiceId) {
      const invoice = obj(await client.invoices.retrieve(invoiceId, {}, { stripeAccount: account })); const subId = subscriptionId(invoice);
      if (subId) return (await client.subscriptions.retrieve(subId, {}, { stripeAccount: account })).metadata.pagerOrderId;
    }
  }
  // On newer API versions the charge no longer includes an invoice. InvoicePayments is the canonical link.
  const payments = await client.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: paymentId }, limit: 10 }, { stripeAccount: account });
  for (const payment of payments.data) {
    const invoice = obj(await client.invoices.retrieve(id(payment.invoice)!, {}, { stripeAccount: account })); const subId = subscriptionId(invoice);
    if (subId) { const sub = await client.subscriptions.retrieve(subId, {}, { stripeAccount: account }); if (sub.metadata.pagerOrderId) return sub.metadata.pagerOrderId; }
  }
  return undefined;
}
async function invoiceEvents(invoiceId: string, event: Stripe.Event, client: Stripe): Promise<CommerceEvent[]> {
  const account = event.account!; const opts = { stripeAccount: account };
  const invoice = obj(await client.invoices.retrieve(invoiceId, { expand: ["payments.data.payment.payment_intent"] }, opts));
  const subId = subscriptionId(invoice); if (!subId) return [];
  const subscription = await client.subscriptions.retrieve(subId, {}, opts); const orderId = subscription.metadata.pagerOrderId;
  if (!orderId) return [];
  const base = { id: event.id, provider: "stripe" as const, accountId: account, orderId, at: seconds(event.created)!, subscriptionId: subId };
  if (invoice.status !== "paid") return event.type === "invoice.payment_failed" ? [{ ...base, type: "subscription", subscriptionStatus: "past_due" }] : [];
  const lines = obj(invoice.lines); const data = Array.isArray(lines.data) ? lines.data.map(obj) : [];
  // The MVP creates exactly one monthly line, no coupons/trials/prorations/taxes.
  if (data.length !== 1 || lines.has_more === true) throw new IntegrationError(409, "Invoice requires manual reconciliation: expected one access line");
  const period = obj(data[0].period); const periodStart = seconds(period.start); const paidThrough = seconds(period.end);
  if (!paidThrough || !periodStart || Date.parse(paidThrough) <= Date.parse(periodStart)) throw new IntegrationError(400, "Invalid invoice period");
  let paymentId = id(invoice.payment_intent);
  const invoicePayments = obj(invoice.payments); const entries = Array.isArray(invoicePayments.data) ? invoicePayments.data.map(obj).filter(p => p.status === "paid") : [];
  if (!paymentId && entries.length === 1) paymentId = id(obj(entries[0].payment).payment_intent);
  if (!paymentId) throw new IntegrationError(409, "Invoice has no supported verified card payment");
  const intent = await client.paymentIntents.retrieve(paymentId, {}, opts);
  if (intent.status !== "succeeded" || intent.amount_received !== invoice.amount_paid) throw new IntegrationError(409, "Invoice payment amount is not reconciled");
  const paid: CommerceEvent = { ...base, type: "paid", paymentId, amount: intent.amount_received, currency: intent.currency, periodStart, paidThrough };
  return [paid];
}
export async function handleStripeEvent(event: Stripe.Event): Promise<{ received: true; ignored?: boolean }> {
  if (isDemoMode()) throw new IntegrationError(409, "Stripe webhooks are disabled in demo mode");
  const client = stripeClient(); const object = obj(event.data.object);
  if (event.type === "account.updated") {
    const account = await client.accounts.retrieve(id(object)!);
    await mutateState(s => { const integration = s.integrations.find(i => i.stripeAccountId === account.id); if (integration) { integration.stripeReady = Boolean(account.charges_enabled && account.payouts_enabled); integration.updatedAt = new Date().toISOString(); } });
    return { received: true };
  }
  if (!event.account) throw new IntegrationError(400, "Connected-account webhook required");
  const opts = { stripeAccount: event.account }; let events: CommerceEvent[] = [];
  const base = { id: event.id, provider: "stripe" as const, accountId: event.account, at: seconds(event.created)! };
  if (event.type.startsWith("checkout.session.")) {
    const session = await client.checkout.sessions.retrieve(id(object)!, {}, opts); const orderId = session.metadata?.pagerOrderId;
    if (!orderId) return { received: true, ignored: true };
    const state = await readState(); const order = state.orders.find(o => o.id === orderId);
    if (!order || order.stripeAccountId !== event.account || (order.stripeSessionId && order.stripeSessionId !== session.id) || session.client_reference_id !== order.id) throw new IntegrationError(403, "Checkout account or order mismatch");
    await mutateState(s => { const current = s.orders.find(o => o.id === orderId)!; if (current.stripeSessionId && current.stripeSessionId !== session.id) throw new IntegrationError(409, "Checkout identity conflict"); current.stripeSessionId = session.id; });
    if (session.mode === "subscription" && session.invoice) events = await invoiceEvents(id(session.invoice)!, event, client);
    else if (session.payment_status === "paid" && session.mode === "payment") {
      const intent = await client.paymentIntents.retrieve(id(session.payment_intent)!, {}, opts);
      if (intent.status !== "succeeded" || intent.amount_received !== session.amount_total) throw new IntegrationError(409, "Checkout payment is not reconciled");
      events = [{ ...base, orderId, type: "paid", paymentId: intent.id, amount: intent.amount_received, currency: intent.currency }];
    } else if (session.status === "expired") events = [{ ...base, orderId, type: "expired" }];
    else if (event.type === "checkout.session.async_payment_failed") events = [{ ...base, orderId, type: "failed" }];
  } else if (["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"].includes(event.type)) events = await invoiceEvents(id(object)!, event, client);
  else if (event.type.startsWith("customer.subscription.")) {
    const subscription = await client.subscriptions.retrieve(id(object)!, {}, opts); const orderId = subscription.metadata.pagerOrderId;
    if (orderId) events = [{ ...base, orderId, type: "subscription", subscriptionId: subscription.id, subscriptionStatus: ["canceled", "incomplete_expired"].includes(subscription.status) ? "cancelled" : subscription.status === "active" ? "active" : "past_due", cancelAtPeriodEnd: subscription.cancel_at_period_end }];
  } else if (event.type === "charge.refunded" || event.type.startsWith("charge.dispute.")) {
    const chargeId = event.type === "charge.refunded" ? id(object)! : id(object.charge)!;
    const charge = await client.charges.retrieve(chargeId, {}, opts); const paymentId = id(charge.payment_intent); if (!paymentId) return { received: true, ignored: true };
    const orderId = await paymentOrder(paymentId, event.account, client); if (!orderId) return { received: true, ignored: true };
    if (event.type === "charge.refunded") events = [{ ...base, orderId, type: "refund", paymentId, amount: charge.amount, currency: charge.currency, refundedAmount: charge.amount_refunded }];
    else {
      const dispute = await client.disputes.retrieve(id(object)!, {}, opts);
      events = [{ ...base, orderId, type: "dispute", paymentId, amount: charge.amount, currency: charge.currency, dispute: dispute.status === "won" || dispute.status === "warning_closed" ? "won" : dispute.status === "lost" ? "lost" : "open" }];
    }
  }
  for (const transition of events) await commitCommerce(transition);
  return { received: true, ...(events.length ? {} : { ignored: true }) };
}

export async function refundOrder(order: Order): Promise<void> {
  if (!order.stripeAccountId) throw new IntegrationError(409, "Order has no connected Stripe account");
  const payments = Object.values(orderMeta(order).payments ?? {}).filter(p => p.paid && p.refundedAmount < p.amount);
  if (!payments.length) { if (order.status === "refunded") return; throw new IntegrationError(409, "No verified payment to refund"); }
  const client = stripeClient();
  for (const payment of payments) await client.refunds.create({ payment_intent: payment.id, reason: "requested_by_customer" }, { stripeAccount: order.stripeAccountId, idempotencyKey: `pager-full-refund-${order.id}-${payment.id}` });
  // A refund request is not a confirmed refund; charge.refunded owns entitlement revocation.
}
export async function reconcileOrders(): Promise<{ checked: number; failures: number }> {
  const snapshot = await readState(); const pending = snapshot.orders.filter(o => o.status === "pending" && Date.parse(o.expiresAt) <= Date.now()); let failures = 0;
  for (const order of pending) {
    try {
      if (order.test) { await commitCommerce({ id: `expire:${order.id}`, provider: "demo", orderId: order.id, type: "expired", at: new Date().toISOString() }); continue; }
      const client = stripeClient(); let session: Stripe.Checkout.Session;
      if (!order.stripeSessionId) {
        // Never retry creation with a new expiry/price or after Stripe's idempotency retention.
        // Enumerate the connected account's sessions since this order; incomplete scans keep the reservation.
        let found: Stripe.Checkout.Session | undefined; let checked = 0;
        for await (const candidate of client.checkout.sessions.list({ created: { gte: Math.floor(Date.parse(order.createdAt) / 1000) - 60 }, limit: 100 }, { stripeAccount: order.stripeAccountId })) {
          if (++checked > 1000) throw new IntegrationError(409, "Checkout recovery scan exceeded limit; manual reconciliation required");
          if (candidate.metadata?.pagerOrderId === order.id && candidate.client_reference_id === order.id) { found = candidate; break; }
        }
        if (!found) {
          if (Date.now() > Date.parse(order.expiresAt) + 60_000) await commitCommerce({ id: `reconcile-not-created:${order.id}`, provider: "stripe", accountId: order.stripeAccountId, orderId: order.id, type: "failed", at: new Date().toISOString() });
          continue;
        }
        session = found;
        await mutateState(s => { const current = s.orders.find(o => o.id === order.id)!; current.stripeSessionId = session.id; });
      } else session = await client.checkout.sessions.retrieve(order.stripeSessionId, {}, { stripeAccount: order.stripeAccountId });
      if (session.status === "open") session = await client.checkout.sessions.expire(session.id, {}, { stripeAccount: order.stripeAccountId, idempotencyKey: `pager-expire-${order.id}` });
      // Reconciliation deliberately does not grant on API reads; paid orders wait for their signed webhook.
      if (session.status === "expired") await commitCommerce({ id: `reconcile-expired:${session.id}`, provider: "stripe", accountId: order.stripeAccountId, orderId: order.id, type: "expired", at: new Date().toISOString() });
    } catch { failures += 1; await mutateState(s => { const current = s.orders.find(o => o.id === order.id); if (current) orderMeta(current).checkoutError = "Provider reconciliation failed; reservation preserved, retry from Inngest"; }); }
  }
  for (const order of snapshot.orders.filter(o => !o.test && orderMeta(o).inventoryShortfall && o.status === "paid")) { try { await refundOrder(order); } catch { failures += 1; } }
  return { checked: pending.length, failures };
}
