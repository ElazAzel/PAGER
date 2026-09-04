import { authenticated, body, demoFields, response, route } from "@/lib/integrations/runtime";
import { bookingInputSchema, createDemoBooking } from "@/lib/integrations/bookings";
import { isDemoMode, mutateState } from "@/lib/server/store";
import { prepareOrder } from "@/lib/integrations/checkout";
import { queueBookingNotices } from "@/lib/integrations/notification-queue";
import { createCalBooking } from "@/lib/integrations/booking-create";
import { getCapabilities } from "@/lib/server/capabilities";
import { dispatchNotifications } from "@/lib/integrations/notifications";
import { rateLimit } from "@/lib/server/rate-limit";
import type { CommerceBooking } from "@/lib/integrations/model";
export const runtime = "nodejs";
export const POST = (request: Request) => route(async () => {
  const user = await authenticated(request); const input = await body(request, bookingInputSchema);
  await rateLimit(`booking-create:${user.id}`, 15, 60_000);
  const demo = isDemoMode();
  const result = demo ? { booking: await mutateState(state => { const booking = createDemoBooking(state, user, input); queueBookingNotices(state, booking); return booking; }) } : await createCalBooking(user, input);
  if (!result.booking) return response({ providerUpdatePending: true, ...demoFields() }, 202);
  const booking = result.booking;
  let orderId: string | undefined; let paymentError: string | undefined;
  try { if (getCapabilities().payments) orderId = await mutateState(state => { const item = state.items.find(i => i.id === booking.itemId); return item?.price ? prepareOrder(state, user, { pageId: booking.pageId, blockId: input.blockId, itemId: item.id, bookingId: booking.id, scope: "item", mode: "one_time", quantity: 1 }, demo).id : undefined; }); }
  catch { paymentError = "Booking confirmed; payment setup failed. Retry checkout from the booking."; }
  await dispatchNotifications(booking.id);
  const projected = { ...booking } as CommerceBooking; delete projected.commerce;
  return response({ booking: projected, orderId, paymentError, ...demoFields() });
});
