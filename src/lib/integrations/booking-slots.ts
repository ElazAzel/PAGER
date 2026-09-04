import "server-only";
import { z } from "zod";
import type { DatabaseState, User } from "../types";
import { canAccessBlock } from "../server/access";
import { assertPageAvailable } from "../server/capabilities";
import { isDemoMode, readState } from "../server/store";
import { calRequest } from "./cal";
import { timezoneSchema } from "./bookings";
import { IntegrationError } from "./security";

export type BookingSlot = { startAt: string; endAt: string };
const instant = z.string().datetime({ offset: true });
export const bookingSlotQuery = z.object({ blockId: z.string().min(1).max(200), itemId: z.string().min(1).max(200).optional(), start: instant, end: instant, timezone: timezoneSchema }).strict();
export type SlotRange = Pick<z.infer<typeof bookingSlotQuery>, "start" | "end" | "timezone">;
export function validateSlotRange(input: SlotRange, now = Date.now()): SlotRange {
  const { start, end, timezone } = z.object({ start: instant, end: instant, timezone: timezoneSchema }).parse(input);
  const from = Date.parse(start); const until = Date.parse(end);
  if (from < now - 60_000 || until <= from || until - from > 7 * 86400_000 || until > now + 180 * 86400_000) throw new IntegrationError(400, "Choose up to seven future days within 180 days / Выберите до семи будущих дней в пределах 180 дней");
  return { start: new Date(from).toISOString(), end: new Date(until).toISOString(), timezone };
}
export function resolveBookingScope(state: DatabaseState, input: { pageId?: string; slug?: string; blockId: string; itemId?: string }, userId?: string) {
  const page = state.publishedPages.find(value => (!input.pageId || value.id === input.pageId) && (!input.slug || value.slug === input.slug) && value.publishedAt);
  const block = page?.blocks.find(value => value.id === input.blockId && value.type === "booking" && !value.hidden && !value.archived);
  if (!page || !block || !canAccessBlock(page, block, userId, state.entitlements)) throw new IntegrationError(404, "Booking is unavailable / Запись недоступна");
  assertPageAvailable(page);
  const draft = state.pages.find(value => value.id === page.id && value.ownerId === page.ownerId); if (draft) assertPageAvailable(draft);
  const item = input.itemId ? state.items.find(value => value.id === input.itemId && value.pageId === page.id && value.ownerId === page.ownerId && value.kind === "service" && block.data.itemIds?.includes(value.id)) : undefined;
  if (input.itemId && !item) throw new IntegrationError(404, "Service is unavailable / Услуга недоступна");
  const eventTypeId = item?.eventTypeId ?? block.data.eventTypeId;
  return { page, block, item, eventTypeId };
}
export function requireCalEvent(state: DatabaseState, scope: ReturnType<typeof resolveBookingScope>): number {
  if (!Number.isSafeInteger(scope.eventTypeId) || !scope.eventTypeId || scope.eventTypeId < 1) throw new IntegrationError(503, "The creator has not connected this service to Cal / Автор ещё не подключил эту услугу к Cal");
  const integration = state.integrations.find(value => value.ownerId === scope.page.ownerId);
  if (!(integration?.calApiKeyEncrypted || integration?.calAccessTokenEncrypted) || !integration.calWebhookSecretEncrypted) throw new IntegrationError(503, "The creator's booking connection is not ready / Подключение записи у автора ещё не готово");
  return scope.eventTypeId;
}
export async function fetchCalSlots(ownerId: string, eventTypeId: number, input: SlotRange, bookingUidToReschedule?: string): Promise<BookingSlot[]> {
  const range = validateSlotRange(input);
  const query = new URLSearchParams({ eventTypeId: String(eventTypeId), start: range.start, end: range.end, timeZone: range.timezone, format: "range", ...(bookingUidToReschedule ? { bookingUidToReschedule } : {}) });
  const result = z.object({ status: z.literal("success"), data: z.record(z.string(), z.array(z.object({ start: instant, end: instant }))) }).safeParse(await calRequest(ownerId, `/slots?${query}`));
  if (!result.success) throw new IntegrationError(502, "Cal returned an unsupported availability response / Cal вернул некорректный список времени");
  const slots = new Map<string, BookingSlot>();
  for (const day of Object.values(result.data.data)) for (const value of day) {
    const start = Date.parse(value.start); const end = Date.parse(value.end);
    if (start < Date.parse(range.start) || start >= Date.parse(range.end) || end <= start || end - start > 24 * 3600_000) continue;
    const startAt = new Date(start).toISOString(); slots.set(startAt, { startAt, endAt: new Date(end).toISOString() });
  }
  if (slots.size > 2000) throw new IntegrationError(502, "Too many Cal slots returned / Cal вернул слишком много вариантов времени");
  return [...slots.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}
export function demoBookingSlots(state: DatabaseState, ownerId: string, input: SlotRange): BookingSlot[] {
  const range = validateSlotRange(input); const slots: BookingSlot[] = [];
  // Explicit local demonstration: hourly appointments, never provider availability.
  const nextHour = Math.ceil(Math.max(Date.parse(range.start), Date.now() + 60_000) / 3600_000) * 3600_000;
  for (let start = nextHour; start < Date.parse(range.end); start += 3600_000) {
    const hour = Number(new Intl.DateTimeFormat("en", { timeZone: range.timezone, hour: "2-digit", hourCycle: "h23" }).format(start));
    if (hour < 9 || hour > 17) continue;
    const end = start + 3600_000;
    if (!state.bookings.some(value => value.test && value.ownerId === ownerId && value.status === "confirmed" && Date.parse(value.startAt) < end && Date.parse(value.endAt) > start)) slots.push({ startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() });
  }
  return slots;
}
export async function getBookingSlots(slug: string, input: z.infer<typeof bookingSlotQuery>, user?: Pick<User, "id"> | null) {
  const range = validateSlotRange(input); const state = await readState(); const scope = resolveBookingScope(state, { slug, ...input }, user?.id);
  const demo = isDemoMode();
  const slots = demo ? demoBookingSlots(state, scope.page.ownerId, range) : await fetchCalSlots(scope.page.ownerId, requireCalEvent(state, scope), range);
  return { slots, timezone: range.timezone, demo, provider: demo ? "local_demo" as const : "cal" as const };
}
