import { describe, expect, it } from "vitest";
import { createDemoState } from "../src/lib/server/seed";
import { claimUnassignedBookings } from "../src/lib/integrations/booking-claims";
import type { Booking } from "../src/lib/types";
describe("verified-email booking claims", () => {
  it("makes a pre-registration Cal booking visible only to its verified email owner", () => {
    const state = createDemoState(); const buyer = state.users.find(u => u.role === "buyer")!; const other = state.users.filter(u => u.role === "buyer")[1]; const contact = state.contacts[0];
    const booking: Booking = { id: "pre-registration", ownerId: contact.ownerId, pageId: state.pages[0].id, contactId: contact.id, opportunityId: "opp", title: "Call", startAt: "2026-09-04T12:00:00Z", endAt: "2026-09-04T13:00:00Z", timezone: "UTC", status: "confirmed", version: 1, createdAt: "2026-09-02T12:00:00Z", test: false };
    state.bookings = [booking];
    claimUnassignedBookings(state, other, false); expect(booking.buyerId).toBeUndefined();
    claimUnassignedBookings(state, buyer, false); expect(booking.buyerId).toBe(buyer.id);
    claimUnassignedBookings(state, other, false); expect(booking.buyerId).toBe(buyer.id);
  });
  it("rejects a mismatched tenant contact and cannot move bookings between data modes", () => {
    const state = createDemoState(); const buyer = state.users.find(u => u.role === "buyer")!;
    const b: Booking = { id: "bad-link", ownerId: "creator-other", pageId: "page-other", contactId: state.contacts[0].id, opportunityId: "opp", title: "Call", startAt: "2026-09-04T12:00:00Z", endAt: "2026-09-04T13:00:00Z", timezone: "UTC", status: "confirmed", version: 1, createdAt: "2026-09-02T12:00:00Z", test: false };
    const demo = { ...b, id: "demo", ownerId: state.contacts[0].ownerId, test: true }; state.bookings = [b, demo];
    claimUnassignedBookings(state, buyer, false); expect(b.buyerId).toBeUndefined(); expect(demo.buyerId).toBeUndefined();
  });
});
