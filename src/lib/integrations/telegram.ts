import "server-only";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { DatabaseState, User } from "../types";
import { isDemoMode } from "../server/store";
import { integrationFor } from "./runtime";
import { encryptSecret, hashToken, IntegrationError, secretKey } from "./security";
import { recipientTelegram, type CommerceIntegration } from "./model";

export function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const username = process.env.TELEGRAM_BOT_USERNAME ?? "";
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (isDemoMode() || process.env.PAGER_TELEGRAM_ENABLED !== "true" || !/^\d+:[A-Za-z0-9_-]+$/.test(token) || !/^[A-Za-z0-9_]{5,32}$/.test(username) || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret)) {
    throw new IntegrationError(503, "Optional Telegram is disabled or not configured; email delivery is independent");
  }
  secretKey();
  return { token, username, webhookSecret, botId: token.split(":")[0] };
}
export function telegramReady(): boolean { try { telegramConfig(); return true; } catch { return false; } }
export function telegramStatus(state: DatabaseState, user: User) {
  const connection = recipientTelegram(state, user.id, user.email);
  const configured = telegramReady();
  return { configured, connected: configured && connection?.botId === telegramConfig().botId };
}
// The route passes only the authenticated session user; it accepts no recipient or chat ID.
export function createTelegramPair(state: DatabaseState, user: User, now = Date.now()) {
  const config = telegramConfig();
  const recipient = user.email.trim().toLowerCase();
  if (!state.users.some(u => u.id === user.id && u.email.trim().toLowerCase() === recipient)) throw new IntegrationError(403, "Verified recipient required");
  const token = randomBytes(32).toString("base64url");
  const integration = integrationFor(state, user.id);
  (integration.commerce ??= {}).telegramPair = { hash: hashToken(token), expiresAt: now + 600_000, recipient, recipientId: user.id, botId: config.botId };
  integration.updatedAt = new Date(now).toISOString();
  return { url: `https://t.me/${config.username}?start=${token}`, expiresAt: new Date(now + 600_000).toISOString() };
}
export function disconnectTelegram(state: DatabaseState, user: User): void {
  const integration = state.integrations.find(i => i.ownerId === user.id) as CommerceIntegration | undefined;
  if (!integration) return;
  if (integration.commerce) { delete integration.commerce.telegram; delete integration.commerce.telegramPair; }
  integration.updatedAt = new Date().toISOString();
}
export function verifyTelegramWebhook(secret: string | null): boolean {
  const expected = Buffer.from(telegramConfig().webhookSecret);
  const actual = Buffer.from(secret ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const updateSchema = z.object({ update_id: z.number().int().nonnegative(), message: z.object({
  text: z.string().max(4096).optional(),
  chat: z.object({ id: z.number().int().positive().safe(), type: z.literal("private") }),
  from: z.object({ id: z.number().int().positive().safe(), is_bot: z.literal(false) }),
}).optional() });
// Run only after authenticating the webhook, in one store transaction. No bot reply is sent.
export function applyTelegramUpdate(state: DatabaseState, value: unknown, now = Date.now()): boolean {
  const config = telegramConfig();
  const update = updateSchema.safeParse(value);
  if (!update.success || !update.data.message) return false;
  const message = update.data.message;
  if (message.chat.id !== message.from.id) return false;
  const match = /^\/start(?:@([A-Za-z0-9_]+))? ([A-Za-z0-9_-]{43})$/.exec(message.text ?? "");
  if (!match || (match[1] && match[1].toLowerCase() !== config.username.toLowerCase())) return false;
  const hash = hashToken(match[2]);
  const integration = state.integrations.find(i => (i as CommerceIntegration).commerce?.telegramPair?.hash === hash) as CommerceIntegration | undefined;
  const pair = integration?.commerce?.telegramPair;
  if (!integration || !pair || pair.expiresAt <= now || pair.botId !== config.botId || pair.recipientId !== integration.ownerId || !state.users.some(u => u.id === pair.recipientId && u.email.trim().toLowerCase() === pair.recipient)) return false;
  const id = randomUUID();
  integration.commerce!.telegram = { id, recipient: pair.recipient, recipientId: pair.recipientId, botId: pair.botId, chatIdEncrypted: encryptSecret(String(message.chat.id), `${pair.recipientId}:telegram:${id}`), connectedAt: new Date(now).toISOString() };
  delete integration.commerce!.telegramPair; // Atomic consumption makes concurrent/replayed updates harmless.
  integration.updatedAt = new Date(now).toISOString();
  return true;
}
