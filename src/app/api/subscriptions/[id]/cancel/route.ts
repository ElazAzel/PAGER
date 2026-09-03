import { authenticated, demoFields, response, route } from "@/lib/integrations/runtime";
import { isDemoMode, mutateState, readState } from "@/lib/server/store";
import { stripeClient } from "@/lib/integrations/stripe";
import { IntegrationError } from "@/lib/integrations/security";
export const runtime = "nodejs";
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await authenticated(request); const { id } = await context.params;
  const subscription = (await readState()).subscriptions.find(s => s.id === id && s.buyerId === user.id);
  if (!subscription) throw new IntegrationError(404, "Subscription not found");
  if (!isDemoMode()) {
    if (!subscription.stripeId || !subscription.stripeAccountId) throw new IntegrationError(409, "Real subscription identifiers missing");
    await stripeClient().subscriptions.update(subscription.stripeId, { cancel_at_period_end: true }, { stripeAccount: subscription.stripeAccountId, idempotencyKey: `pager-cancel-${subscription.id}` });
  }
  const updated = await mutateState(state => { const sub = state.subscriptions.find(s => s.id === id && s.buyerId === user.id)!; sub.cancelAtPeriodEnd = true; sub.updatedAt = new Date().toISOString(); return sub; });
  return response({ subscription: updated, ...demoFields() });
});
