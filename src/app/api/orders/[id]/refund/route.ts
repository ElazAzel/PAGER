import { creator, demoFields, ownedOrder, publicOrder, response, route } from "@/lib/integrations/runtime";
import { isDemoMode, mutateState, readState } from "@/lib/server/store";
import { orderMeta } from "@/lib/integrations/model";
import { applyCommerceEvent } from "@/lib/integrations/transitions";
import { refundOrder } from "@/lib/integrations/stripe";
export const runtime = "nodejs";
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await creator(request); const { id } = await context.params;
  const order = ownedOrder(await readState(), id, user, true);
  if (isDemoMode()) await mutateState(s => {
    const current = ownedOrder(s, id, user, true);
    for (const payment of Object.values(orderMeta(current).payments ?? {}).filter(p => p.paid)) applyCommerceEvent(s, { id: `refund:${id}:${payment.id}`, provider: "demo", orderId: id, type: "refund", paymentId: payment.id, amount: payment.amount, currency: payment.currency, refundedAmount: payment.amount, at: new Date().toISOString() });
  });
  else await refundOrder(order);
  return response({ order: publicOrder(ownedOrder(await readState(), id, user, true)), refundRequested: true, ...demoFields() });
});
