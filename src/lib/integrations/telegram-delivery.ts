import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseState } from "../types";
import { isDemoMode, mutateState } from "../server/store";
import { bookingNoticeContent, noticeIsCurrent, type Notice } from "./notification-queue";
import { recipientTelegram } from "./model";
import { decryptSecret, IntegrationError } from "./security";
import { telegramConfig } from "./telegram";

function target(state: DatabaseState, id: string) {
  const notice = state.notifications.find(n => n.id === id) as Notice | undefined;
  const delivery = notice?.delivery?.telegram;
  if (!notice || !delivery || notice.test || ["sent", "suppressed"].includes(delivery.status)) return;
  const booking = state.bookings.find(b => b.id === notice.bookingId && b.ownerId === notice.ownerId && !b.test);
  const connection = recipientTelegram(state, booking?.buyerId, notice.recipient);
  if (!booking || !noticeIsCurrent(notice, booking) || notice.delivery?.suppressed || (notice.kind.startsWith("booking_reminder") && Date.parse(booking.startAt) <= Date.now()) || !connection || connection.id !== delivery.connectionId || connection.recipientId !== delivery.recipientId) {
    delivery.status = "suppressed"; delivery.error = "Booking superseded or recipient Telegram consent changed";
    return;
  }
  if (Date.parse(notice.scheduledAt) > Date.now()) throw new IntegrationError(409, "Notification is not due");
  return { notice, delivery, booking, connection };
}
function recordFailure(state: DatabaseState, notice: Notice, pageId: string, recipientId: string) {
  const id = `notification-failure:telegram:${notice.id}`;
  if (!state.analytics.some(a => a.id === id)) state.analytics.push({ id, ownerId: notice.ownerId, pageId, kind: "notification_failed", visitorId: recipientId, createdAt: new Date().toISOString(), test: false });
}
export async function deliverTelegramNotification(notificationId: string): Promise<string> {
  if (isDemoMode()) return "skipped";
  // Commit an uncertainty marker before any external call. Telegram has no sendMessage idempotency key.
  const attempt = await mutateState(state => {
    const current = target(state, notificationId); if (!current) return undefined;
    const { delivery, notice, booking, connection } = current;
    if (delivery.status === "unknown") return { error: "Telegram delivery outcome unknown; manual reconciliation required" };
    if (delivery.retryAt && delivery.retryAt > Date.now()) return { error: "Telegram retry is waiting for the provider rate limit" };
    try {
      if (telegramConfig().botId !== connection.botId) { delivery.status = "suppressed"; delivery.error = "Telegram bot changed; recipient must reconnect"; return undefined; }
      // Validate stored encryption before recording an uncertain external attempt.
      decryptSecret(connection.chatIdEncrypted, `${connection.recipientId}:telegram:${connection.id}`);
    } catch {
      delivery.status = "failed"; delivery.error = "Optional Telegram unavailable; check bot configuration and encryption key. Email is independent";
      recordFailure(state, notice, booking.pageId, delivery.recipientId);
      return { error: delivery.error };
    }
    delivery.status = "unknown"; delivery.attemptId = randomUUID();
    delivery.error = "Telegram delivery outcome unknown; manual reconciliation required before another send";
    return { id: delivery.attemptId };
  });
  if (!attempt) return "skipped";
  if (attempt.error) throw new IntegrationError(502, attempt.error);
  const outcome = await mutateState(async state => {
    const current = target(state, notificationId); if (!current) return "skipped";
    const { notice, booking, delivery, connection } = current;
    if (delivery.attemptId !== attempt.id || delivery.status !== "unknown") return "skipped";
    let config: ReturnType<typeof telegramConfig>; let chatId: string;
    try {
      config = telegramConfig();
      if (config.botId !== connection.botId) throw new Error("Bot changed");
      chatId = decryptSecret(connection.chatIdEncrypted, `${connection.recipientId}:telegram:${connection.id}`);
    } catch {
      delivery.status = "failed"; delivery.error = "Optional Telegram configuration changed before sending; email is independent";
      recordFailure(state, notice, booking.pageId, delivery.recipientId); return "failed";
    }
    const { subject, text } = bookingNoticeContent(state, notice, booking);
    try {
      // The same transaction protects version/consent checks through the external send.
      const result = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: `${subject}\n\n${text}`.slice(0, 4096), link_preview_options: { is_disabled: true }, protect_content: true }), signal: AbortSignal.timeout(10_000), redirect: "error" });
      const value = await result.json() as { ok?: boolean; result?: { message_id?: number; chat?: { id?: number; type?: string } }; error_code?: number; parameters?: { retry_after?: number } };
      if (result.ok && value.ok === true && Number.isSafeInteger(value.result?.message_id) && String(value.result?.chat?.id) === chatId && value.result?.chat?.type === "private") {
        delivery.status = "sent"; delivery.providerId = String(value.result!.message_id); delete delivery.error; delete delivery.retryAt; return "sent";
      }
      if (value.ok === false && Number.isInteger(value.error_code) && value.error_code! >= 400 && value.error_code! < 500) {
        delivery.status = "failed"; delivery.error = `Telegram rejected delivery (${value.error_code}); retry via Inngest. Email is independent`;
        const seconds = value.parameters?.retry_after;
        if (value.error_code === 429 && Number.isSafeInteger(seconds) && seconds! > 0) delivery.retryAt = Date.now() + seconds! * 1000;
      }
    } catch { /* Timeout/invalid response may follow a successful send: keep the durable unknown marker. */ }
    recordFailure(state, notice, booking.pageId, delivery.recipientId);
    return delivery.status;
  });
  if (outcome === "failed" || outcome === "unknown") throw new IntegrationError(502, `Optional Telegram delivery ${outcome}; inspect durable outbox. Email result retained`);
  return outcome;
}
