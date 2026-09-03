import { describe, expect, it } from "vitest";
import type { Booking } from "../src/lib/types";
import { createDemoState } from "../src/lib/server/seed";
import { queueBookingNotices, noticeIsCurrent } from "../src/lib/integrations/notification-queue";
describe("notification outbox", () => {
  const now = "2026-09-02T12:00:00.000Z";
  it("deduplicates confirmation and 24h reminder; reschedule invalidates old jobs", () => {
    const state = createDemoState(); const contact = state.contacts[0];
    const booking: Booking = { id: "booking1", ownerId: contact.ownerId, pageId: state.pages[0].id, contactId: contact.id, opportunityId: "opp", title: "Session", startAt: "2026-09-05T12:00:00Z", endAt: "2026-09-05T13:00:00Z", timezone: "Asia/Almaty", status: "confirmed", version: 1, createdAt: now, test: true };
    state.bookings.push(booking); state.notifications = [];
    queueBookingNotices(state, booking, now); queueBookingNotices(state, booking, now);
    expect(state.notifications).toHaveLength(2); expect(state.notifications[1].scheduledAt).toBe("2026-09-04T12:00:00.000Z");
    expect(state.notifications.every(n => n.test && n.status !== "sent")).toBe(true);
    const old = { ...state.notifications[1] }; booking.version = 2; booking.startAt = "2026-09-06T12:00:00Z";
    queueBookingNotices(state, booking, now); expect(noticeIsCurrent(old, booking)).toBe(false);
    expect(state.notifications.filter(n => noticeIsCurrent(n, booking))).toHaveLength(2);
    booking.status = "cancelled"; booking.version = 3; queueBookingNotices(state, booking, now);
    expect(state.notifications.filter(n => noticeIsCurrent(n, booking))).toHaveLength(1);
  });
  it("under-24h booking queues confirmation only", () => {
    const state = createDemoState(); const contact = state.contacts[0];
    const booking: Booking = { id: "near", ownerId: contact.ownerId, pageId: state.pages[0].id, contactId: contact.id, opportunityId: "opp", title: "Session", startAt: "2026-09-03T11:00:00Z", endAt: "2026-09-03T12:00:00Z", timezone: "UTC", status: "confirmed", version: 1, createdAt: now, test: true };
    state.notifications = []; queueBookingNotices(state, booking, now); expect(state.notifications).toHaveLength(1);
  });
});
