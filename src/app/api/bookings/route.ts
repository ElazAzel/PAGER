import { authenticated, body, demoFields, response, route } from "@/lib/integrations/runtime";
import { bookingInputSchema, createDemoBooking } from "@/lib/integrations/bookings";
import { isDemoMode, mutateState, readState } from "@/lib/server/store";
import { prepareOrder } from "@/lib/integrations/checkout";
import { queueBookingNotices } from "@/lib/integrations/notification-queue";
import { canAccessBlock } from "@/lib/server/access";
import { IntegrationError } from "@/lib/integrations/security";
import { validateCalLink } from "@/lib/integrations/cal";
export const runtime = "nodejs";
export const POST = (request: Request) => route(async () => {
  const user = await authenticated(request); const input = await body(request, bookingInputSchema);
  if (!isDemoMode()) {
    const state = await readState(); const page = state.publishedPages.find(p => p.id === input.pageId); const block = page?.blocks.find(b => b.id === input.blockId && b.type === "booking");
    if (!page || !block || !canAccessBlock(page, block, user.id, state.entitlements)) throw new IntegrationError(403, "Booking block is unavailable");
    const integration = state.integrations.find(i => i.ownerId === page.ownerId); const calLink = block.data.calLink ?? integration?.calLink;
    if (!calLink) throw new IntegrationError(503, "Creator Cal booking link is not configured");
    return response({ error: "Book in Cal first. PAGER confirms bookings only from verified Cal webhooks.", provider: "cal", bookingUrl: validateCalLink(calLink), demo: false }, 409);
  }
  const booking = await mutateState(state => { const booking = createDemoBooking(state, user, input); queueBookingNotices(state, booking); return booking; });
  let orderId: string | undefined; let paymentError: string | undefined;
  try { orderId = await mutateState(state => { const item = state.items.find(i => i.id === booking.itemId); return item?.price ? prepareOrder(state, user, { pageId: booking.pageId, blockId: input.blockId, itemId: item.id, bookingId: booking.id, scope: "item", mode: "one_time", quantity: 1 }, true).id : undefined; }); }
  catch { paymentError = "Booking confirmed; payment setup failed. Retry checkout from the booking."; }
  return response({ booking, orderId, paymentError, ...demoFields() });
});
