import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Booking, DatabaseState, User, WebhookEvent } from "../types";
import { mutateState, readState } from "../server/store";
import { calRequest, CalRequestError } from "./cal";
import { applyCalBookingEvent, bookingInputSchema, timezoneSchema } from "./bookings";
import { fetchCalSlots, requireCalEvent, resolveBookingScope } from "./booking-slots";
import { IntegrationError } from "./security";
import { queueBookingNotices } from "./notification-queue";
import type { CommerceBooking } from "./model";

type Input = z.infer<typeof bookingInputSchema>;
type Attempt = WebhookEvent & { ownerId: string; buyerId: string; pageId: string; blockId: string; itemId?: string; eventTypeId: number; startAt: string; endAt: string; fingerprint: string; status: "pending" | "uncertain" | "confirmed" | "failed"; providerId?: string; bookingId?: string };
const prefix = "cal-booking-attempt:";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const providerBooking = z.object({ status: z.literal("success"), data: z.object({ uid: z.string().min(1).max(200), eventTypeId: z.number().int().positive(), title: z.string().max(500), status: z.string(), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }), createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }).optional(), attendees: z.array(z.object({ email: z.string().email(), name: z.string().max(200), timeZone: timezoneSchema })).length(1) }) });
type Result = { booking: Booking; providerUpdatePending?: false } | { booking?: undefined; providerUpdatePending: true };
const pending: Result = { providerUpdatePending: true };
function sameBooking(state: DatabaseState, ownerId: string, user: User, input: Input): Booking | undefined {
  return state.bookings.find(value => !value.test && value.ownerId === ownerId && value.pageId === input.pageId && value.buyerId === user.id && value.itemId === input.itemId && (value as CommerceBooking).commerce?.sourceBlockId === input.blockId && value.startAt === new Date(input.startAt!).toISOString() && value.status === "confirmed");
}
async function acceptProviderResult(value: unknown, attempt: Attempt, user: User, input: Input): Promise<Result> {
  const parsed = providerBooking.safeParse(value);
  if (!parsed.success) throw new IntegrationError(502, "Cal booking confirmation is incomplete / Подтверждение записи от Cal неполное");
  const booking = parsed.data.data; const attendee = booking.attendees[0];
  if (booking.eventTypeId !== attempt.eventTypeId || Date.parse(booking.start) !== Date.parse(attempt.startAt) || Date.parse(booking.end) !== Date.parse(attempt.endAt) || attendee.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) throw new IntegrationError(502, "Cal confirmation does not match the requested booking / Подтверждение Cal не соответствует выбранной записи");
  if (booking.status.toLowerCase() !== "accepted") return pending;
  return mutateState(state => {
    const scope = resolveBookingScope(state, input, user.id);
    if (requireCalEvent(state, scope) !== booking.eventTypeId || scope.page.ownerId !== attempt.ownerId) throw new IntegrationError(409, "Booking configuration changed; contact the creator / Настройки записи изменились. Свяжитесь с автором");
    const confirmed = applyCalBookingEvent(state, attempt.ownerId, { uid: booking.uid, eventTypeId: booking.eventTypeId, kind: "BOOKING_CREATED", at: booking.updatedAt ?? booking.createdAt, startAt: booking.start, endAt: booking.end, timezone: attendee.timeZone, email: attendee.email.toLowerCase().trim(), name: attendee.name, title: booking.title }, `api:${booking.uid}`);
    if (confirmed.buyerId !== user.id) throw new IntegrationError(409, "Booking ownership requires reconciliation / Не удалось подтвердить владельца записи");
    queueBookingNotices(state, confirmed);
    const current = state.webhooks.find(row => row.id === attempt.id) as Attempt | undefined;
    if (current) { current.status = "confirmed"; current.bookingId = confirmed.id; current.providerId = booking.uid; }
    return { booking: confirmed };
  });
}
export async function createCalBooking(user: User, input: Input): Promise<Result> {
  if (!input.idempotencyKey || !input.startAt) throw new IntegrationError(400, "Select an available time / Выберите доступное время");
  if (input.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) throw new IntegrationError(403, "Use your verified email / Используйте подтверждённый email");
  const startAt = new Date(input.startAt).toISOString(); const start = Date.parse(startAt);
  if (start < Date.now() + 60_000 || start > Date.now() + 179 * 86400_000) throw new IntegrationError(400, "Select a future available time / Выберите доступное время в будущем");
  const state = await readState(); const scope = resolveBookingScope(state, input, user.id);
  if (scope.page.ownerId === user.id) throw new IntegrationError(409, "You cannot book your own service / Нельзя записаться на свою услугу");
  const eventTypeId = requireCalEvent(state, scope);
  // Incoming webhooks must also be able to map the event without trusting browser metadata.
  const origins = state.publishedPages.filter(page => page.ownerId === scope.page.ownerId && page.publishedAt).flatMap(page => page.blocks.filter(block => block.type === "booking" && !block.hidden && !block.archived && (block.data.eventTypeId === eventTypeId || state.items.some(item => item.ownerId === page.ownerId && item.pageId === page.id && item.kind === "service" && block.data.itemIds?.includes(item.id) && item.eventTypeId === eventTypeId))));
  if (origins.length !== 1) throw new IntegrationError(503, "This Cal event must be linked to one booking block / Событие Cal должно быть связано с одним блоком записи");
  const id = `${prefix}${hash([scope.page.ownerId, user.id, input.idempotencyKey])}`;
  const fingerprint = hash([input.pageId, input.blockId, input.itemId ?? null, eventTypeId, startAt, input.timezone]);
  const previous = state.webhooks.find(row => row.id === id) as Attempt | undefined;
  if (previous && previous.fingerprint !== fingerprint) throw new IntegrationError(409, "This request was already used for another time / Этот запрос уже использован для другого времени");
  const existing = sameBooking(state, scope.page.ownerId, user, input); if (existing) return { booking: existing };
  if (previous && previous.status !== "failed") {
    if (previous.providerId) {
      try { return await acceptProviderResult(await calRequest(previous.ownerId, `/bookings/${encodeURIComponent(previous.providerId)}`), previous, user, input); }
      catch { return pending; }
    }
    return pending;
  }
  // Fresh provider availability is mandatory even when the browser recently loaded slots.
  const available = await fetchCalSlots(scope.page.ownerId, eventTypeId, { start: startAt, end: new Date(start + 86400_000).toISOString(), timezone: input.timezone });
  const slot = available.find(value => value.startAt === startAt);
  if (!slot) throw new IntegrationError(409, "This time is no longer available / Это время уже занято");
  const claimed = await mutateState(state => {
    const currentScope = resolveBookingScope(state, input, user.id);
    if (requireCalEvent(state, currentScope) !== eventTypeId || currentScope.page.ownerId !== scope.page.ownerId) throw new IntegrationError(409, "Booking settings changed; reload available times / Настройки изменились. Обновите список времени");
    const existing = sameBooking(state, scope.page.ownerId, user, input); if (existing) return { existing };
    const current = state.webhooks.find(row => row.id === id) as Attempt | undefined;
    if (current && current.fingerprint !== fingerprint) throw new IntegrationError(409, "Booking request already used / Запрос записи уже использован");
    if (current && current.status !== "failed") return { busy: true };
    const conflicts = state.bookings.some(value => !value.test && value.ownerId === scope.page.ownerId && value.status === "confirmed" && Date.parse(value.startAt) < Date.parse(slot.endAt) && Date.parse(value.endAt) > start);
    const pendingConflict = state.webhooks.some(row => { const attempt = row as Attempt; return row.id.startsWith(prefix) && attempt.ownerId === scope.page.ownerId && ["pending", "uncertain"].includes(attempt.status) && Date.parse(attempt.startAt) < Date.parse(slot.endAt) && Date.parse(attempt.endAt) > start; });
    if (conflicts || pendingConflict) throw new IntegrationError(409, "This time is already booked or being confirmed / Это время уже занято или подтверждается");
    const attempt: Attempt = { id, provider: "cal", processedAt: new Date().toISOString(), ownerId: scope.page.ownerId, buyerId: user.id, pageId: input.pageId, blockId: input.blockId, itemId: input.itemId, eventTypeId, startAt, endAt: slot.endAt, fingerprint, status: "pending" };
    if (current) Object.assign(current, attempt); else state.webhooks.push(attempt);
    return { attempt };
  });
  if (claimed.existing) return { booking: claimed.existing }; if (!claimed.attempt) return pending;
  try {
    const value = await calRequest(scope.page.ownerId, "/bookings", "POST", { eventTypeId, start: startAt, attendee: { name: input.name, email: user.email.trim().toLowerCase(), timeZone: input.timezone, language: user.locale }, metadata: { pagerRequest: id } });
    const identity = z.object({ data: z.object({ uid: z.string().min(1).max(200) }) }).safeParse(value);
    if (identity.success) await mutateState(state => { const attempt = state.webhooks.find(row => row.id === id) as Attempt | undefined; if (attempt) attempt.providerId = identity.data.data.uid; });
    return await acceptProviderResult(value, claimed.attempt, user, input);
  } catch (error) {
    const safe = error instanceof CalRequestError && error.safeToRetry;
    await mutateState(state => { const attempt = state.webhooks.find(row => row.id === id) as Attempt | undefined; if (attempt && attempt.status !== "confirmed") attempt.status = safe ? "failed" : "uncertain"; });
    if (safe) throw error;
    // An upstream timeout or malformed success may still have created a real booking.
    // Keep the durable attempt and reconcile via its UID or the signed webhook.
    return pending;
  }
}
