import "server-only";
import type { User } from "../types";
import { isDemoMode, readState, mutateState } from "../server/store";
import { authorizeBooking } from "./bookings";
import { applyBookingUpdate } from "./booking-transitions";
import { IntegrationError } from "./security";
import { calRequest } from "./cal";
import { queueBookingNotices } from "./notification-queue";
import { dispatchNotifications } from "./notifications";
export async function changeBooking(id: string, user: User, change: { action: "cancel" } | { action: "reschedule"; startAt: string; endAt: string; timezone: string }) {
  const booking = authorizeBooking(await readState(), id, user);
  if (booking.test !== isDemoMode()) throw new IntegrationError(403, "Booking belongs to another integration mode");
  if (booking.status === "cancelled") { if (change.action === "cancel") return { booking, providerUpdatePending: false }; throw new IntegrationError(409, "Cancelled bookings cannot be rescheduled"); }
  if (change.action === "reschedule" && (Date.parse(change.startAt) <= Date.now() || Date.parse(change.endAt) <= Date.parse(change.startAt))) throw new IntegrationError(400, "Invalid future booking interval");
  if (!isDemoMode()) {
    if (!booking.providerId) throw new IntegrationError(409, "Booking has no Cal identifier");
    await calRequest(booking.ownerId, `/bookings/${encodeURIComponent(booking.providerId)}/${change.action === "cancel" ? "cancel" : "reschedule"}`, "POST", change.action === "cancel" ? { cancellationReason: "Requested in PAGER" } : { start: change.startAt, rescheduledBy: user.email, reschedulingReason: "Requested in PAGER" });
    // Cal owns the duration and timezone. Request success is not a booking confirmation.
    return { booking, providerUpdatePending: true };
  }
  const updated = await mutateState(state => {
    const current = authorizeBooking(state, id, user);
    if (current.version !== booking.version) throw new IntegrationError(409, "Booking changed; reload and retry");
    if (change.action === "reschedule" && state.bookings.some(b => b.id !== id && b.ownerId === current.ownerId && b.status === "confirmed" && Date.parse(b.startAt) < Date.parse(change.endAt) && Date.parse(b.endAt) > Date.parse(change.startAt))) throw new IntegrationError(409, "Demo slot is already booked");
    applyBookingUpdate(current, { id: `demo:${id}:${current.version}:${change.action}`, at: new Date().toISOString(), status: change.action === "cancel" ? "cancelled" : "confirmed", ...(change.action === "reschedule" ? change : {}) });
    queueBookingNotices(state, current); return current;
  });
  await dispatchNotifications(id); return { booking: updated, providerUpdatePending: false };
}
