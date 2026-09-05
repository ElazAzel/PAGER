import type { Locale } from "./types";

export type BookingSlot = { startAt: string; endAt: string };
export type PresentedBookingSlot = BookingSlot & { timeLabel: string; endTimeLabel: string };
export type BookingSlotDay = { id: string; label: string; slots: PresentedBookingSlot[] };

function formatters(locale: Locale, requestedTimeZone: string) {
  const localeName = locale === "ru" ? "ru-RU" : "en-US";
  let timeZone = requestedTimeZone;
  try {
    new Intl.DateTimeFormat(localeName, { timeZone }).format(0);
  } catch {
    timeZone = "UTC";
  }

  return {
    day: new Intl.DateTimeFormat(localeName, { timeZone, weekday: "short", month: "short", day: "numeric" }),
    key: new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }),
    time: new Intl.DateTimeFormat(localeName, { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

function dateKey(formatter: Intl.DateTimeFormat, date: Date): string {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function groupBookingSlots(slots: readonly BookingSlot[], locale: Locale, timeZone: string): BookingSlotDay[] {
  const formatter = formatters(locale, timeZone);
  const groups = new Map<string, BookingSlotDay>();

  const valid = slots
    .map(slot => ({ slot, start: new Date(slot.startAt), end: new Date(slot.endAt) }))
    .filter(({ start, end }) => Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const { slot, start, end } of valid) {
    const id = dateKey(formatter.key, start);
    const group = groups.get(id) ?? { id, label: formatter.day.format(start), slots: [] };
    group.slots.push({ ...slot, timeLabel: formatter.time.format(start), endTimeLabel: formatter.time.format(end) });
    groups.set(id, group);
  }

  return [...groups.values()];
}
