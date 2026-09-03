import "server-only";
import { Inngest } from "inngest";
import { Resend } from "resend";
import { isDemoMode, mutateState, readState } from "../server/store";
import { bookingNoticeContent, noticeIsCurrent, type Notice } from "./notification-queue";
import { env } from "./runtime";
import { IntegrationError } from "./security";
import { reconcileOrders } from "./stripe";
import { deliverTelegramNotification } from "./telegram-delivery";

export const inngest = new Inngest({ id: "pager", eventKey: process.env.INNGEST_EVENT_KEY });
export function notificationsReady(): boolean { return !isDemoMode() && process.env.PAGER_NOTIFICATIONS_ENABLED === "true" && Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM && process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY); }
export async function dispatchNotifications(bookingId?: string): Promise<{ queued: number; ready: boolean }> {
  const ready = notificationsReady();
  const candidates = (await readState()).notifications.filter(n => (!bookingId || n.bookingId === bookingId) && !n.test && n.status !== "sent" && !(n as Notice).delivery?.suppressed && !(n as Notice).delivery?.dispatchedAt).slice(0, 100);
  if (!ready) {
    if (candidates.length) await mutateState(s => { for (const candidate of candidates) { const notice = s.notifications.find(n => n.id === candidate.id); if (notice) notice.error = "Delivery disabled: configure PAGER_NOTIFICATIONS_ENABLED, Inngest and Resend"; } });
    return { queued: 0, ready: false };
  }
  for (const notice of candidates) {
    try {
      await inngest.send({ id: notice.id, name: "pager/notification.requested", data: { notificationId: notice.id, scheduledAt: notice.scheduledAt } });
      await mutateState(state => { const n = state.notifications.find(n => n.id === notice.id) as Notice | undefined; if (n) (n.delivery ??= {}).dispatchedAt = new Date().toISOString(); });
    } catch {
      await mutateState(state => { const n = state.notifications.find(n => n.id === notice.id); if (n) n.error = "Inngest dispatch failed; durable outbox will retry"; });
      // Booking stays confirmed; the outbox is durable and the failure is visible/retryable.
      return { queued: 0, ready: true };
    }
  }
  return { queued: candidates.length, ready: true };
}
async function deliverEmailNotification(notificationId: string): Promise<string> {
  if (!notificationsReady()) throw new IntegrationError(503, "Notification providers are not enabled/configured");
  // Persist the first attempt before calling the provider. Resend idempotency lasts 24 hours.
  await mutateState(state => { const notice = state.notifications.find(n => n.id === notificationId) as Notice | undefined; if (notice && !notice.test && notice.status !== "sent") (notice.delivery ??= {}).firstAttemptAt ??= new Date().toISOString(); });
  const outcome = await mutateState(async state => {
    const notice = state.notifications.find(n => n.id === notificationId) as Notice | undefined;
    if (!notice || notice.test || notice.status === "sent" || notice.delivery?.suppressed) return "skipped";
    const booking = state.bookings.find(b => b.id === notice.bookingId && b.ownerId === notice.ownerId);
    if (!booking || !noticeIsCurrent(notice, booking) || (notice.kind.startsWith("booking_reminder") && Date.parse(booking.startAt) <= Date.now())) { (notice.delivery ??= {}).suppressed = true; notice.error = "Superseded or booking already started"; return "suppressed"; }
    if (Date.parse(notice.scheduledAt) > Date.now()) throw new IntegrationError(409, "Notification is not due");
    if (notice.delivery?.firstAttemptAt && Date.now() - Date.parse(notice.delivery.firstAttemptAt) > 23 * 3600_000) { notice.status = "failed"; notice.error = "Delivery outcome requires manual reconciliation beyond Resend idempotency window"; return "failed"; }
    const { subject, text } = bookingNoticeContent(state, notice, booking);
    try {
      // Hold the booking transaction through send: cancellation/reschedule cannot slip between version check and send.
      const result = await new Resend(env("RESEND_API_KEY")).emails.send({ from: env("RESEND_FROM"), to: notice.recipient, subject, text }, { idempotencyKey: notice.id });
      if (result.error || !result.data?.id) throw new Error("Resend request failed");
      notice.status = "sent"; delete notice.error; (notice.delivery ??= {}).providerId = result.data.id;
      return "sent";
    } catch {
      notice.status = "failed"; notice.error = "Resend delivery failed; retry via Inngest";
      if (!state.analytics.some(a => a.id === `notification-failure:${notice.id}`)) state.analytics.push({ id: `notification-failure:${notice.id}`, ownerId: notice.ownerId, pageId: booking.pageId, kind: "notification_failed", visitorId: booking.buyerId ?? booking.contactId, createdAt: new Date().toISOString(), test: false });
      return "failed";
    }
  });
  if (outcome === "failed") throw new IntegrationError(502, "Notification delivery failed; inspect durable outbox");
  return outcome;
}
export async function deliverNotification(notificationId: string): Promise<string> {
  if (!notificationsReady()) throw new IntegrationError(503, "Notification providers are not enabled/configured");
  // Telegram is an optional independent result; a retry never resends a successful email.
  let emailError: unknown; let emailOutcome = "skipped";
  try { emailOutcome = await deliverEmailNotification(notificationId); } catch (error) { emailError = error; }
  let telegramError: unknown;
  try { await deliverTelegramNotification(notificationId); } catch (error) { telegramError = error; }
  if (emailError) throw emailError;
  if (telegramError) throw telegramError;
  return emailOutcome;
}
export const notificationFunction = inngest.createFunction({ id: "booking-notification", retries: 5, concurrency: { limit: 1, key: "event.data.notificationId" } }, { event: "pager/notification.requested" }, async ({ event, step }) => {
  const { notificationId, scheduledAt } = event.data as { notificationId: string; scheduledAt: string };
  if (Date.parse(scheduledAt) > Date.now()) await step.sleepUntil("wait-until-due", new Date(scheduledAt));
  return step.run("deliver-current-booking-version", () => deliverNotification(notificationId));
});
export const maintenanceFunction = inngest.createFunction({ id: "commerce-reconciliation", retries: 3, concurrency: 1 }, { cron: "*/5 * * * *" }, async ({ step }) => {
  if (isDemoMode()) return { demo: true, disabled: true };
  const stock = await step.run("reconcile-expired-checkouts", reconcileOrders);
  const outbox = await step.run("dispatch-notification-outbox", () => dispatchNotifications());
  if (stock.failures) throw new IntegrationError(502, `${stock.failures} orders require provider reconciliation; reservations kept safe`);
  return { stock, outbox };
});
