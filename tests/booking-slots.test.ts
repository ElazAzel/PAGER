import { describe, expect, it } from "vitest";
import { groupBookingSlots } from "../src/lib/booking-slots";

const slots = [
  { startAt: "2026-09-04T23:30:00.000Z", endAt: "2026-09-05T00:00:00.000Z" },
  { startAt: "2026-09-05T00:30:00.000Z", endAt: "2026-09-05T01:00:00.000Z" },
];

describe("booking slot presentation", () => {
  it("groups slots by the visitor's calendar day and timezone", () => {
    const grouped = groupBookingSlots(slots, "en", "Asia/Almaty");
    expect(grouped).toHaveLength(1);
    expect(grouped[0].id).toBe("2026-09-05");
    expect(grouped[0].slots.map(slot => slot.timeLabel)).toEqual(["04:30", "05:30"]);
  });

  it("keeps UTC slots on their distinct calendar days", () => {
    expect(groupBookingSlots(slots, "en", "UTC").map(day => day.id)).toEqual(["2026-09-04", "2026-09-05"]);
  });

  it("sorts valid slots and ignores invalid provider timestamps", () => {
    const grouped = groupBookingSlots([
      slots[1],
      { startAt: "not-a-date", endAt: "still-not-a-date" },
      slots[0],
    ], "ru", "UTC");
    expect(grouped.flatMap(day => day.slots.map(slot => slot.startAt))).toEqual(slots.map(slot => slot.startAt));
    expect(grouped.every(day => day.label.length > 0)).toBe(true);
  });
});
