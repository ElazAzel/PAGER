import { z } from "zod";
import { demoTransition } from "@/lib/integrations/checkout";
import { authenticated, body, demoFields, ownedOrder, publicOrder, response, route } from "@/lib/integrations/runtime";
import { isDemoMode, mutateState, readState } from "@/lib/server/store";
import { assertDemoRequest } from "@/lib/integrations/security";
import { markConverted, addTimeline } from "@/lib/server/crm";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) => route(async () => {
  const user = await authenticated(request, false); const { id } = await context.params; const state = await readState();
  const order = ownedOrder(state, id, user); const locale = state.publishedPages.find(page => page.id === order.pageId)?.locale ?? state.pages.find(page => page.id === order.pageId)?.locale ?? "ru";
  return response({ order: publicOrder(order), locale, ...demoFields() });
});
export const POST = (request: Request, context: Context) => route(async () => {
  assertDemoRequest(request, isDemoMode()); const user = await authenticated(request); const { id } = await context.params;
  const { action } = await body(request, z.object({ action: z.enum(["pay", "cancel"]) }).strict());
  const order = await mutateState(state => {
    const order = ownedOrder(state, id, user); const wasPaid = order.paidAt;
    demoTransition(state, order, action);
    if (!wasPaid && order.paidAt) { markConverted(state, order.opportunityId, "paid"); addTimeline(state, { ownerId: order.ownerId, contactId: order.contactId, kind: "payment_paid", title: "DEMO / ДЕМО: simulated payment confirmed", referenceId: order.id }); }
    return publicOrder(order);
  });
  return response({ order, ...demoFields() });
});
