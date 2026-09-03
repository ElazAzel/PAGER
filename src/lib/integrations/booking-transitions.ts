import type { Booking } from "../types";
import type { CommerceBooking } from "./model";
import { IntegrationError } from "./security";
export type BookingUpdate = { id: string; at: string; status: Booking["status"]; startAt?: string; endAt?: string; timezone?: string; providerId?: string };
export function applyBookingUpdate(booking: Booking, event: BookingUpdate): boolean {
  const meta = (booking as CommerceBooking).commerce ??= {};
  const at = Date.parse(event.at);
  if (!Number.isFinite(at)) throw new IntegrationError(400, "Invalid booking event timestamp");
  if (meta.eventId === event.id || (meta.providerAt && at < Date.parse(meta.providerAt))) return false;
  if (booking.status === "cancelled" && event.status === "confirmed" && !event.providerId) return false;
  const startAt = event.startAt ?? booking.startAt; const endAt = event.endAt ?? booking.endAt;
  if (!Number.isFinite(Date.parse(startAt)) || Date.parse(endAt) <= Date.parse(startAt)) throw new IntegrationError(400, "Invalid booking period");
  const changed = booking.status !== event.status || Date.parse(startAt) !== Date.parse(booking.startAt) || Date.parse(endAt) !== Date.parse(booking.endAt) || (event.timezone && event.timezone !== booking.timezone);
  if (event.providerId && booking.providerId !== event.providerId) { meta.providerAliases = [...new Set([...(meta.providerAliases ?? []), ...(booking.providerId ? [booking.providerId] : [])])]; booking.providerId = event.providerId; }
  booking.status = event.status; booking.startAt = new Date(startAt).toISOString(); booking.endAt = new Date(endAt).toISOString(); booking.timezone = event.timezone ?? booking.timezone;
  meta.providerAt = event.at; meta.eventId = event.id;
  if (changed) booking.version += 1;
  return Boolean(changed);
}
export function reminderAt(startAt: string, now: string): string | null {
  const reminder = Date.parse(startAt) - 24 * 60 * 60 * 1000;
  return Number.isFinite(reminder) && reminder > Date.parse(now) ? new Date(reminder).toISOString() : null;
}
export function shouldDeliverBookingNotice(booking: Booking, version: number): boolean { return booking.status === "confirmed" && booking.version === version; }
