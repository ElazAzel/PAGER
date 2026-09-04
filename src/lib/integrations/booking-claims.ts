import "server-only";
import type { DatabaseState, User } from "../types";
import { isDemoMode, mutateState, readState } from "../server/store";
import { prepareOrder } from "./checkout";
import type { CommerceBooking } from "./model";
import { getCapabilities } from "../server/capabilities";
// Call only with the verified server session User. Never accept a body-supplied email or buyer ID.
export function claimUnassignedBookings(state: DatabaseState, user: User, demo: boolean): void {
  for (const booking of state.bookings) {
    if (booking.buyerId || booking.ownerId === user.id || booking.test !== demo) continue;
    const contact = state.contacts.find(c => c.id === booking.contactId && c.ownerId === booking.ownerId);
    if (contact?.email.trim().toLowerCase() === user.email.trim().toLowerCase()) booking.buyerId = user.id;
  }
}
export async function claimBuyerBookings(user: User): Promise<void> {
  const demo = isDemoMode();
  await mutateState(state => claimUnassignedBookings(state, user, demo));
  if (!getCapabilities().payments) return;
  const state = await readState();
  const candidates = state.bookings.filter(b => b.buyerId === user.id && b.test === demo && b.status === "confirmed" && b.itemId && state.items.some(i => i.id === b.itemId && i.ownerId === b.ownerId && i.price > 0) && !state.orders.some(o => o.bookingId === b.id && !["failed", "expired"].includes(o.status)));
  for (const booking of candidates) {
    try {
      await mutateState(s => prepareOrder(s, user, { pageId: booking.pageId, blockId: (booking as CommerceBooking).commerce?.sourceBlockId, itemId: booking.itemId, bookingId: booking.id, scope: "item", mode: "one_time", quantity: 1 }, demo));
    } catch {
      // The booking remains owned and visible even when Stripe or the published item needs repair.
      await mutateState(s => { if (!s.analytics.some(a => a.id === `booking-order:${booking.id}`)) s.analytics.push({ id: `booking-order:${booking.id}`, ownerId: booking.ownerId, pageId: booking.pageId, kind: "payment_failed", visitorId: user.id, createdAt: new Date().toISOString(), test: demo || process.env.PAGER_STRIPE_LIVE !== "true" }); });
    }
  }
}
