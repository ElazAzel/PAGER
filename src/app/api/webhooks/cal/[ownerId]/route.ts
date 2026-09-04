import { z } from "zod";
import { rawBody, response, route } from "@/lib/integrations/runtime";
import { decryptSecret, hashToken, IntegrationError, verifyCalSignature } from "@/lib/integrations/security";
import { readState, mutateState, isDemoMode } from "@/lib/server/store";
import { applyCalBookingEvent, parseCalEvent, timezoneSchema } from "@/lib/integrations/bookings";
import { calRequest } from "@/lib/integrations/cal";
import { queueBookingNotices } from "@/lib/integrations/notification-queue";
import { dispatchNotifications } from "@/lib/integrations/notifications";
import { prepareOrder } from "@/lib/integrations/checkout";
import type { CommerceBooking } from "@/lib/integrations/model";
import { getCapabilities } from "@/lib/server/capabilities";
export const runtime = "nodejs";
const canonicalSchema = z.object({ data: z.object({ uid: z.string(), eventTypeId: z.number(), title: z.string(), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }), status: z.string(), updatedAt: z.string().datetime({ offset: true }).optional(), rescheduledFromUid: z.string().nullable().optional(), rescheduledToUid: z.string().nullable().optional(), attendees: z.array(z.object({ email: z.string().email(), name: z.string(), timeZone: timezoneSchema })).min(1) }) });
export const POST = (request: Request, context: { params: Promise<{ ownerId: string }> }) => route(async () => {
  if (isDemoMode()) throw new IntegrationError(409, "Cal webhooks are disabled in local demo mode");
  const { ownerId } = await context.params; const state = await readState(); const integration = state.integrations.find(i => i.ownerId === ownerId);
  if (!integration?.calWebhookSecretEncrypted) throw new IntegrationError(404, "Cal webhook is not configured");
  const raw = await rawBody(request); const secret = decryptSecret(integration.calWebhookSecretEncrypted, `${ownerId}:cal-webhook`);
  if (!verifyCalSignature(raw, request.headers.get("x-cal-signature-256"), secret)) throw new IntegrationError(401, "Invalid Cal webhook signature");
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new IntegrationError(400, "Invalid webhook JSON"); }
  const event = parseCalEvent(value); const deliveryId = hashToken(raw);
  // Cal signatures have no timestamp header. Durable receipt + canonical read prevent stale replays from resurrecting bookings.
  if (state.webhooks.some(w => w.id === `cal:${ownerId}:${deliveryId}`)) return response({ received: true, replay: true });
  let canonical = canonicalSchema.parse(await calRequest(ownerId, `/bookings/${encodeURIComponent(event.uid)}`)).data;
  for (let hops = 0; canonical.rescheduledToUid && hops < 5; hops++) canonical = canonicalSchema.parse(await calRequest(ownerId, `/bookings/${encodeURIComponent(canonical.rescheduledToUid)}`)).data;
  if (canonical.rescheduledToUid) throw new IntegrationError(409, "Cal reschedule chain requires reconciliation");
  if (!["accepted", "cancelled", "canceled"].includes(canonical.status.toLowerCase())) return response({ received: true, ignored: true, reason: "Cal booking is not confirmed" });
  if (canonical.eventTypeId !== event.eventTypeId || canonical.attendees[0].email.toLowerCase() !== event.email) throw new IntegrationError(409, "Cal webhook and canonical booking disagree");
  const finalEvent = { ...event, uid: canonical.uid, previousUid: canonical.rescheduledFromUid ?? event.previousUid, at: canonical.updatedAt ?? event.at, startAt: canonical.start, endAt: canonical.end, timezone: canonical.attendees[0].timeZone, kind: canonical.status.toLowerCase() === "accepted" ? (canonical.uid !== event.uid || event.kind === "BOOKING_RESCHEDULED" ? "BOOKING_RESCHEDULED" as const : "BOOKING_CREATED" as const) : "BOOKING_CANCELLED" as const };
  const booking = await mutateState(s => { const booking = applyCalBookingEvent(s, ownerId, finalEvent, deliveryId); queueBookingNotices(s, booking); return booking; });
  let orderId: string | undefined;
  if (getCapabilities().payments && booking.status === "confirmed" && booking.itemId && booking.buyerId) {
    try { orderId = await mutateState(s => { const buyer = s.users.find(u => u.id === booking.buyerId)!; return prepareOrder(s, buyer, { pageId: booking.pageId, scope: "item", mode: "one_time", quantity: 1, bookingId: booking.id, itemId: booking.itemId, blockId: (booking as CommerceBooking).commerce?.sourceBlockId }, false).id; }); }
    catch { await mutateState(s => { if (!s.analytics.some(a => a.id === `booking-order:${booking.id}`)) s.analytics.push({ id: `booking-order:${booking.id}`, ownerId, pageId: booking.pageId, kind: "payment_failed", visitorId: booking.buyerId!, createdAt: new Date().toISOString(), test: process.env.PAGER_STRIPE_LIVE !== "true" }); }); }
  }
  await dispatchNotifications(booking.id);
  return response({ received: true, bookingId: booking.id, orderId });
});
