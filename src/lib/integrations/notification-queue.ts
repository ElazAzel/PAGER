import type { Booking, DatabaseState, Notification } from "../types";
import { reminderAt } from "./booking-transitions";
import { recipientTelegram } from "./model";
export type TelegramDelivery = { recipientId: string; connectionId: string; status: "pending" | "sent" | "failed" | "unknown" | "suppressed"; attemptId?: string; providerId?: string; error?: string; retryAt?: number };
export type Notice = Notification & { delivery?: { dispatchedAt?: string; firstAttemptAt?: string; suppressed?: boolean; providerId?: string; telegram?: TelegramDelivery } };
export function bookingNoticeContent(state: DatabaseState, notice: Notification, booking: Booking) {
  const user = state.users.find(u => u.id === booking.buyerId); const page = state.publishedPages.find(p => p.id === booking.pageId);
  const ru = (user?.locale ?? page?.locale) === "ru"; const reminder = notice.kind.startsWith("booking_reminder"); const cancelled = notice.kind.startsWith("booking_cancelled");
  const subject = cancelled ? ru ? "PAGER: запись отменена" : "PAGER: booking cancelled" : reminder ? ru ? "PAGER: напоминание о записи" : "PAGER: booking reminder" : ru ? "PAGER: запись подтверждена" : "PAGER: booking confirmed";
  const when = new Intl.DateTimeFormat(ru ? "ru-RU" : "en-GB", { dateStyle: "full", timeStyle: "short", timeZone: booking.timezone }).format(new Date(booking.startAt));
  const text = `${booking.title}\n${when} (${booking.timezone})\n\n${cancelled ? (ru ? "Запись отменена." : "Your booking is cancelled.") : (ru ? "Запись подтверждена. Оплата услуги оформляется отдельно в ваших покупках." : "Your booking is confirmed. Service payment is separate in your purchase library.")}`;
  return { subject, text };
}
export function noticeIsCurrent(notice: Notification, booking: Booking): boolean {
  const [kind, version] = notice.kind.split(":v");
  return notice.bookingId === booking.id && Number(version) === booking.version && (kind === "booking_cancelled" ? booking.status === "cancelled" : booking.status === "confirmed");
}
export function queueBookingNotices(state: DatabaseState, booking: Booking, now = new Date().toISOString()): void {
  const contact = state.contacts.find(c => c.id === booking.contactId && c.ownerId === booking.ownerId);
  if (!contact) throw new Error("Notification contact is missing");
  for (const notification of state.notifications.filter(n => n.bookingId === booking.id)) if (!noticeIsCurrent(notification, booking) && notification.status !== "sent") {
    const notice = notification as Notice; (notice.delivery ??= {}).suppressed = true; notice.error = "Superseded by cancellation or reschedule";
  }
  const put = (kind: string, scheduledAt: string) => {
    const id = `${kind}:${booking.id}:v${booking.version}`; if (state.notifications.some(n => n.id === id)) return;
    const connection = !booking.test && recipientTelegram(state, booking.buyerId, contact.email);
    const notice: Notice = { id, ownerId: booking.ownerId, bookingId: booking.id, recipient: contact.email, kind: `${kind}:v${booking.version}`, status: "pending", scheduledAt, createdAt: now, test: booking.test, ...(booking.test ? { error: "LOCAL DEMO / ДЕМО: no email or reminder is sent" } : {}) };
    if (connection) notice.delivery = { telegram: { recipientId: connection.recipientId, connectionId: connection.id, status: "pending" } };
    state.notifications.push(notice);
  };
  if (booking.status === "cancelled") put("booking_cancelled", now);
  else { put("booking_confirmation", now); const reminder = reminderAt(booking.startAt, now); if (reminder) put("booking_reminder", reminder); }
}
