import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { verifyStripeWebhook, checkoutParameters } from "../src/lib/integrations/stripe";
import type { Order, User } from "../src/lib/types";
const order: Order = { id: "order", ownerId: "creator", pageId: "page", buyerId: "buyer", contactId: "contact", opportunityId: "opp", scope: "page", title: "Page", mode: "one_time", amount: 1200, quantity: 1, currency: "usd", shippingAmount: 0, status: "pending", fulfillment: "unfulfilled", stripeAccountId: "acct_creator", expiresAt: new Date(Date.now() + 31 * 60000).toISOString(), createdAt: new Date().toISOString(), test: false };
const user: User = { id: "buyer", email: "buyer@example.com", name: "Buyer", locale: "en", role: "buyer", createdAt: order.createdAt };
describe("Stripe boundary", () => {
  it("rejects unsigned, tampered, old and wrong-mode events", () => {
    const secret = "whsec_testing"; const payload = JSON.stringify({ id: "evt_1", object: "event", account: "acct_creator", livemode: false, type: "checkout.session.completed", data: { object: {} } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyStripeWebhook(payload, signature, secret, false).id).toBe("evt_1");
    expect(() => verifyStripeWebhook(payload + " ", signature, secret, false)).toThrow();
    expect(() => verifyStripeWebhook(payload, "", secret, false)).toThrow();
    expect(() => verifyStripeWebhook(payload, signature, secret, true)).toThrow();
    const expired = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 601 });
    expect(() => verifyStripeWebhook(payload, expired, secret, false)).toThrow();
  });
  it("builds immutable server-price direct Checkout with zero platform fee and verified buyer identity", () => {
    const params = checkoutParameters(order, user, "https://pager.example");
    expect(params.customer_email).toBe("buyer@example.com"); expect(params.client_reference_id).toBe("order");
    expect(params.payment_intent_data?.application_fee_amount).toBe(0);
    expect(params.payment_intent_data?.transfer_data).toBeUndefined();
    expect(params.line_items?.[0].price_data?.unit_amount).toBe(1200);
    const recurring = checkoutParameters({ ...order, mode: "monthly" }, user, "https://pager.example");
    expect(recurring.subscription_data?.application_fee_percent).toBe(0);
    expect(recurring.line_items?.[0].price_data?.recurring?.interval).toBe("month");
    expect(recurring.success_url).not.toContain("action=pay");
  });
});
