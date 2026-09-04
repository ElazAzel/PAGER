import type { Booking, DatabaseState, User } from "../types";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { IntegrationError } from "./security";
import { applyBookingUpdate } from "./booking-transitions";
import type { CommerceBooking } from "./model";
import { canAccessBlock } from "../server/access";
import { upsertContact, createOpportunity, markConverted, addTimeline } from "../server/crm";
import { assertPageAvailable } from "../server/capabilities";
export type CalBookingEvent = { uid: string; previousUid?: string; eventTypeId: number; kind: "BOOKING_CREATED" | "BOOKING_RESCHEDULED" | "BOOKING_CANCELLED"; at: string; startAt: string; endAt: string; timezone: string; email: string; name: string; title: string };
export function authorizeBooking(state: DatabaseState, id: string, user: User): Booking {
  const booking = state.bookings.find(b => b.id === id);
  const contact = booking && state.contacts.find(c => c.id === booking.contactId && c.ownerId === booking.ownerId);
  if (!booking || (booking.ownerId !== user.id && booking.buyerId !== user.id && (booking.buyerId || contact?.email.toLowerCase() !== user.email.toLowerCase()))) throw new IntegrationError(404, "Booking not found");
  return booking;
}
export const timezoneSchema = z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Invalid timezone");
const iso = z.string().datetime({ offset: true });
export function parseCalEvent(value: unknown): CalBookingEvent {
  const parsed = z.object({ triggerEvent: z.enum(["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"]), createdAt: iso,
    payload: z.object({ uid: z.string().min(1).max(200), rescheduleUid: z.string().optional(), eventTypeId: z.number().int().positive(), title: z.string().max(500).optional(), startTime: iso, endTime: iso, attendees: z.array(z.object({ email: z.string().email(), name: z.string().max(200), timeZone: timezoneSchema })).min(1) }) }).safeParse(value);
  if (!parsed.success) throw new IntegrationError(400, "Unsupported Cal webhook payload");
  const { payload, triggerEvent, createdAt } = parsed.data;
  if (Date.parse(payload.endTime) <= Date.parse(payload.startTime)) throw new IntegrationError(400, "Invalid booking interval");
  const attendee = payload.attendees[0];
  return { uid: payload.uid, previousUid: payload.rescheduleUid, eventTypeId: payload.eventTypeId, kind: triggerEvent, at: createdAt, startAt: new Date(payload.startTime).toISOString(), endAt: new Date(payload.endTime).toISOString(), timezone: attendee.timeZone, email: attendee.email.toLowerCase().trim(), name: attendee.name, title: payload.title ?? "Booking" };
}
export function applyCalBookingEvent(state: DatabaseState, ownerId: string, event: CalBookingEvent, deliveryId: string): Booking {
  const key = `cal:${ownerId}:${deliveryId}`;
  let booking = state.bookings.find(b => b.ownerId === ownerId && !b.test && (b.providerId === event.uid || b.providerId === event.previousUid || (b as CommerceBooking).commerce?.providerAliases?.includes(event.uid))) as CommerceBooking | undefined;
  if (state.webhooks.some(w => w.id === key)) { if (!booking) throw new IntegrationError(409, "Booking replay has no associated record"); return booking; }
  const buyer = state.users.find(u => u.email.toLowerCase() === event.email && u.id !== ownerId);
  if (!booking) {
    const matches = state.publishedPages.filter(p => p.ownerId === ownerId && p.publishedAt).flatMap(page => page.blocks.filter(block => block.type === "booking" && !block.hidden && !block.archived && (block.data.eventTypeId === event.eventTypeId || state.items.some(i => block.data.itemIds?.includes(i.id) && i.ownerId === ownerId && i.kind === "service" && i.eventTypeId === event.eventTypeId))).map(block => ({ page, block })));
    if (matches.length !== 1) throw new IntegrationError(409, "Cal event type must map to exactly one published booking block");
    const { page, block } = matches[0];
    assertPageAvailable(page);
    if (!canAccessBlock(page, block, buyer?.id, state.entitlements)) throw new IntegrationError(403, "Booking block access is required");
    const item = state.items.find(i => i.ownerId === ownerId && i.pageId === page.id && i.kind === "service" && block.data.itemIds?.includes(i.id) && i.eventTypeId === event.eventTypeId);
    const contact = upsertContact(state, ownerId, event.email, event.name);
    const opportunity = createOpportunity(state, { ownerId, pageId: page.id, contactId: contact.id, source: "booking", id: `cal-opportunity:${ownerId}:${event.previousUid ?? event.uid}`, test: false });
    booking = { id: randomUUID(), ownerId, pageId: page.id, contactId: contact.id, opportunityId: opportunity.id, buyerId: buyer?.id, itemId: item?.id, providerId: event.uid, title: item?.title ?? event.title, startAt: event.startAt, endAt: event.endAt, timezone: event.timezone, status: event.kind === "BOOKING_CANCELLED" ? "cancelled" : "confirmed", version: 1, createdAt: event.at, test: false, commerce: { providerAt: event.at, eventId: deliveryId, sourceBlockId: block.id, providerAliases: event.previousUid ? [event.previousUid] : [] } };
    state.bookings.push(booking);
  } else {
    // Old-UID cancellation after a reschedule must not cancel the new booking.
    if (booking.providerId !== event.uid && event.kind === "BOOKING_CANCELLED") { state.webhooks.push({ id: key, provider: "cal", processedAt: new Date().toISOString() }); return booking; }
    const contact = state.contacts.find(c => c.id === booking!.contactId && c.ownerId === ownerId);
    if (contact?.email !== event.email) throw new IntegrationError(409, "Cal attendee changed; manual reconciliation required");
    applyBookingUpdate(booking, { id: deliveryId, at: event.at, status: event.kind === "BOOKING_CANCELLED" ? "cancelled" : "confirmed", startAt: event.startAt, endAt: event.endAt, timezone: event.timezone, providerId: event.kind === "BOOKING_RESCHEDULED" ? event.uid : undefined });
  }
  if (booking.status === "confirmed") markConverted(state, booking.opportunityId, "booked");
  addTimeline(state, { ownerId, contactId: booking.contactId, kind: event.kind.toLowerCase(), title: booking.status === "cancelled" ? "Booking cancelled" : "Booking confirmed", referenceId: `${booking.id}:v${booking.version}` });
  state.webhooks.push({ id: key, provider: "cal", processedAt: new Date().toISOString() });
  return booking;
}

export const bookingInputSchema = z.object({ pageId: z.string().min(1).max(200), blockId: z.string().min(1).max(200), itemId: z.string().min(1).max(200).optional(), startAt: iso.optional(), name: z.string().trim().min(1).max(200), email: z.string().email(), timezone: timezoneSchema, idempotencyKey: z.string().uuid().optional() }).strict();
export function createDemoBooking(state: DatabaseState, user: User, input: z.infer<typeof bookingInputSchema>): Booking {
  const page = state.publishedPages.find(p => p.id === input.pageId && p.publishedAt); const block = page?.blocks.find(b => b.id === input.blockId && b.type === "booking" && !b.hidden && !b.archived);
  if (!page || !block || !canAccessBlock(page, block, user.id, state.entitlements)) throw new IntegrationError(403, "Booking block is unavailable");
  assertPageAvailable(page);
  if (input.email.toLowerCase() !== user.email.toLowerCase()) throw new IntegrationError(403, "Use the verified buyer email");
  if (page.ownerId === user.id) throw new IntegrationError(409, "Creators cannot book their own service");
  if (!input.startAt || Date.parse(input.startAt) < Date.now() + 60_000 || Date.parse(input.startAt) > Date.now() + 180 * 86400_000) throw new IntegrationError(400, "Select a future demo slot within 180 days");
  const item = input.itemId ? state.items.find(i => i.id === input.itemId && i.ownerId === page.ownerId && i.pageId === page.id && i.kind === "service" && block.data.itemIds?.includes(i.id)) : undefined;
  if (input.itemId && !item) throw new IntegrationError(403, "Service is unavailable in this booking block");
  const startAt = new Date(input.startAt).toISOString(); const endAt = new Date(Date.parse(startAt) + 60 * 60_000).toISOString();
  const existing = state.bookings.find(b => b.test && b.ownerId === page.ownerId && b.status === "confirmed" && Date.parse(b.startAt) < Date.parse(endAt) && Date.parse(b.endAt) > Date.parse(startAt));
  if (existing) { if (existing.buyerId === user.id && existing.startAt === startAt && existing.itemId === item?.id) return existing; throw new IntegrationError(409, "Demo slot is already booked"); }
  const contact = upsertContact(state, page.ownerId, user.email, input.name); const opportunity = createOpportunity(state, { ownerId: page.ownerId, pageId: page.id, contactId: contact.id, source: "booking", test: true });
  const booking: CommerceBooking = { id: randomUUID(), ownerId: page.ownerId, pageId: page.id, contactId: contact.id, opportunityId: opportunity.id, buyerId: user.id, itemId: item?.id, title: item?.title ?? block.data.title ?? "Demo booking", startAt, endAt, timezone: input.timezone, status: "confirmed", version: 1, createdAt: new Date().toISOString(), test: true, commerce: { sourceBlockId: block.id } };
  state.bookings.push(booking); markConverted(state, opportunity.id, "booked"); addTimeline(state, { ownerId: page.ownerId, contactId: contact.id, kind: "booking_confirmed", title: "DEMO / ДЕМО: local booking confirmed", referenceId: booking.id });
  return booking;
}
