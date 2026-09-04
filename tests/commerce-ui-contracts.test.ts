import { describe, expect, it } from "vitest";
import { accessOfferOptions, normalizeBookingResult } from "../src/lib/commerce";
import type { Booking } from "../src/lib/types";

const booking = { id: "booking-1", ownerId: "creator-1", pageId: "page-1", contactId: "contact-1", opportunityId: "opportunity-1", title: "Session", startAt: "2026-09-05T10:00:00.000Z", endAt: "2026-09-05T11:00:00.000Z", timezone: "UTC", status: "confirmed", version: 1, createdAt: "2026-09-04T10:00:00.000Z", test: true } satisfies Booking;

describe("commerce UI contracts", () => {
  it("preserves payment handoff fields when a booking is confirmed", () => {
    expect(normalizeBookingResult({ booking, orderId: "order-1", paymentError: "" })).toEqual({ booking, orderId: "order-1" });
  });

  it("returns every configured access offer with its billing mode", () => {
    expect(accessOfferOptions({ oneTime: 2900, monthly: 900, currency: "USD" })).toEqual([
      { mode: "one_time", amount: 2900, currency: "USD" },
      { mode: "monthly", amount: 900, currency: "USD" },
    ]);
  });
});
