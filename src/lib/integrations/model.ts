import type { Booking, DatabaseState, Integration, Order, Subscription } from "../types";

// Stored inside the core store's JSON payload. No credentials or this metadata are public projections.
export type PaymentFact = { id: string; amount: number; currency: string; paid: boolean; paidAt?: string; periodStart?: string; paidThrough?: string; refundedAmount: number; dispute?: "open" | "won" | "lost"; disputeAt?: string };
export type OrderCommerce = { sandbox?: boolean; inventory?: "reserved" | "released" | "sold"; inventoryShortfall?: boolean; checkoutUrl?: string; checkoutError?: string; payments?: Record<string, PaymentFact>; invoiceIds?: string[] };
export type CommerceOrder = Order & { commerce?: OrderCommerce };
export type CommerceSubscription = Subscription & { commerce?: { providerAt?: string; terminal?: boolean } };
export type CommerceBooking = Booking & { commerce?: { providerAt?: string; eventId?: string; providerAliases?: string[]; sourceBlockId?: string } };
export type OAuthState = { hash: string; ownerId: string; provider: "stripe" | "cal"; expiresAt: number; used?: boolean };
export type TelegramPair = { hash: string; expiresAt: number; recipient: string; recipientId: string; botId: string };
export type TelegramConnection = { id: string; recipient: string; recipientId: string; botId: string; chatIdEncrypted: string; connectedAt: string };
export type CommerceIntegration = Integration & { commerce?: { oauth?: Partial<Record<"stripe" | "cal", OAuthState>>; calWebhookId?: string | number; calWebhookReady?: boolean; telegramPair?: TelegramPair; telegram?: TelegramConnection } };
// Resolve by the verified recipient, never by a creator's legacy telegramChatId.
export function recipientTelegram(state: DatabaseState, recipientId: string | undefined, email: string): TelegramConnection | undefined {
  const user = state.users.find(u => u.id === recipientId && u.email.trim().toLowerCase() === email.trim().toLowerCase());
  const connection = user && (state.integrations.find(i => i.ownerId === user.id) as CommerceIntegration | undefined)?.commerce?.telegram;
  return connection?.recipientId === user?.id && connection?.recipient === email.trim().toLowerCase() ? connection : undefined;
}
export function orderMeta(order: Order): OrderCommerce { const o = order as CommerceOrder; return o.commerce ??= {}; }
