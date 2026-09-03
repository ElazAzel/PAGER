import { describe, expect, it } from "vitest";
import type { DatabaseState, Booking, User } from "../src/lib/types";
import { authorizeBooking, parseCalEvent, applyCalBookingEvent } from "../src/lib/integrations/bookings";
import { createDemoState } from "../src/lib/server/seed";
describe("booking security", () => {
  const user: User = { id: "buyer", email: "owner@example.com", name: "Buyer", role: "buyer", locale: "en", createdAt: "2026-09-02T12:00:00Z" };
  const booking: Booking = { id: "booking", ownerId: "creator", pageId: "page", buyerId: "buyer", contactId: "contact", opportunityId: "opp", title: "Call", startAt: "2026-09-04T12:00:00Z", endAt: "2026-09-04T13:00:00Z", timezone: "UTC", status: "confirmed", version: 1, createdAt: "2026-09-02T12:00:00Z", test: true };
  it("buyer IDs and contact emails cannot authorize a different customer's cancellation", () => {
    const state = createDemoState(); state.bookings = [booking];
    expect(authorizeBooking(state, booking.id, user).id).toBe(booking.id);
    expect(() => authorizeBooking(state, booking.id, { ...user, id: "other", email: "other@example.com" })).toThrow();
    expect(authorizeBooking(state, booking.id, { ...user, id: "creator" }).id).toBe(booking.id);
  });
  it("Cal normalization requires a booking UID, event type, attendee and valid UTC interval", () => {
    expect(() => parseCalEvent({ triggerEvent: "BOOKING_CREATED", createdAt: "2026-09-02T12:00:00Z", payload: {} })).toThrow();
    const event = parseCalEvent({ triggerEvent: "BOOKING_CREATED", createdAt: "2026-09-02T12:00:00Z", payload: { uid: "uid", eventTypeId: 10, title: "Call", startTime: "2026-09-04T12:00:00Z", endTime: "2026-09-04T13:00:00Z", attendees: [{ email: "Buyer@Example.com", name: "Buyer", timeZone: "Asia/Almaty" }] } });
    expect(event.email).toBe("buyer@example.com"); expect(event.startAt).toBe("2026-09-04T12:00:00.000Z");
  });
  it("signed-provider imports do not bind arbitrary attendee metadata to another tenant", () => {
    const state = createDemoState() as DatabaseState;
    const event = parseCalEvent({ triggerEvent: "BOOKING_CREATED", createdAt: "2026-09-02T12:00:00Z", payload: { uid: "uid", eventTypeId: 999999, startTime: "2026-09-04T12:00:00Z", endTime: "2026-09-04T13:00:00Z", attendees: [{ email: "buyer@example.com", name: "Buyer", timeZone: "UTC" }], metadata: { pagerOwnerId: state.users[0].id } } });
    expect(() => applyCalBookingEvent(state, "another-owner", event, "delivery1")).toThrow();
    expect(state.webhooks).toHaveLength(0);
  });
});
