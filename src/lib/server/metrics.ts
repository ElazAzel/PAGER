import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseState, DashboardData, User } from "../types";
import { ApiError } from "./http";
import { canAccessBlock } from "./access";
import { telegramStatus } from "../integrations/telegram";

type AnalyticsInput = { pageId: string; kind: "view" | "click"; visitorId: string; blockId?: string };
export function recordAnalytics(state: DatabaseState, input: AnalyticsInput, userId?: string, test = false, now = new Date()): void {
  const page = state.publishedPages.find(p => p.id === input.pageId && p.publishedAt); if (!page) throw new ApiError(404, "Page not found");
  if (userId === page.ownerId) return;
  if (input.blockId) { const block = page.blocks.find(b => b.id === input.blockId && !b.archived && !b.hidden); if (!block || !canAccessBlock(page, block, userId, state.entitlements, now)) throw new ApiError(403, "Block access denied"); }
  const day = now.toISOString().slice(0, 10);
  const visitorId = createHash("sha256").update(`${page.ownerId}:${input.visitorId}`).digest("hex");
  if (state.analytics.some(e => e.pageId === page.id && e.kind === input.kind && e.visitorId === visitorId && e.blockId === input.blockId && e.test === test && e.createdAt.slice(0, 10) === day)) return;
  state.analytics.push({ id: randomUUID(), ownerId: page.ownerId, pageId: page.id, kind: input.kind, visitorId, blockId: input.blockId, test, createdAt: now.toISOString() });
}
export function calculateMetrics(state: DatabaseState, ownerId: string, now = new Date()): DashboardData["metrics"] & { revenueByCurrency: Record<string, number> } {
  const start = now.getTime() - 7 * 86400_000; const inWeek = (date: string): boolean => Date.parse(date) >= start && Date.parse(date) <= now.getTime();
  const events = state.analytics.filter(e => e.ownerId === ownerId && !e.test && inWeek(e.createdAt) && e.visitorId !== ownerId);
  const views = events.filter(e => e.kind === "view");
  const pageIds = new Set(state.publishedPages.filter(p => p.ownerId === ownerId && !!p.publishedAt).map(p => p.id));
  const activePages = new Set(views.filter(e => pageIds.has(e.pageId)).map(e => e.pageId)).size;
  const converted = state.opportunities.filter(o => o.ownerId === ownerId && !o.test && o.convertedAt && inWeek(o.convertedAt));
  const allConverted = state.opportunities.filter(o => o.ownerId === ownerId && !o.test && o.convertedAt);
  const repeatContacts = new Set(converted.filter(o => allConverted.some(previous => previous.contactId === o.contactId && previous.id !== o.id && Date.parse(previous.convertedAt!) < Date.parse(o.convertedAt!))).map(o => o.contactId)).size;
  const revenueByCurrency: Record<string, number> = {};
  for (const order of state.orders.filter(o => o.ownerId === ownerId && o.buyerId !== ownerId && !o.test && !(o as typeof o & { commerce?: { sandbox?: boolean } }).commerce?.sandbox && o.status === "paid" && o.paidAt && inWeek(o.paidAt))) revenueByCurrency[order.currency] = (revenueByCurrency[order.currency] ?? 0) + order.amount;
  return { views: views.length, clicks: events.filter(e => e.kind === "click").length, conversions: new Set(converted.map(o => o.id)).size, northStar: activePages ? converted.length / activePages : 0, activePages, repeatContacts, revenue: Object.keys(revenueByCurrency).length === 1 ? Object.values(revenueByCurrency)[0] : 0, revenueByCurrency };
}
export function diagnosticMetrics(state: DatabaseState, ownerId: string, now = new Date()) {
  const week = now.getTime() - 7 * 86400_000;
  const events = state.analytics.filter(e => e.ownerId === ownerId && !e.test && Date.parse(e.createdAt) >= week && Date.parse(e.createdAt) <= now.getTime());
  const creator = state.users.find(u => u.id === ownerId);
  const first = state.bookings.filter(b => b.ownerId === ownerId && b.buyerId !== ownerId && !b.test && b.status === "confirmed" && Date.parse(b.createdAt) <= now.getTime()).map(b => Date.parse(b.createdAt)).sort((a, b) => a - b)[0];
  return { activatedWithin24h: !!creator && !!first && first >= Date.parse(creator.createdAt) && first - Date.parse(creator.createdAt) <= 86400_000, paymentFailures: events.filter(e => e.kind === "payment_failed").length, notificationFailures: events.filter(e => e.kind === "notification_failed").length };
}
export function dashboardData(state: DatabaseState, user: User, demo: boolean): DashboardData & { diagnostics: ReturnType<typeof diagnosticMetrics> } {
  if (user.role !== "creator") throw new ApiError(403, "Creator account required");
  const page = state.pages.find(p => p.ownerId === user.id); if (!page) throw new ApiError(404, "Page not found");
  const integration = state.integrations.find(i => i.ownerId === user.id);
  return structuredClone({ user, page, items: state.items.filter(i => i.ownerId === user.id), contacts: state.contacts.filter(i => i.ownerId === user.id), opportunities: state.opportunities.filter(i => i.ownerId === user.id), bookings: state.bookings.filter(i => i.ownerId === user.id), orders: state.orders.filter(i => i.ownerId === user.id), timeline: state.timeline.filter(i => i.ownerId === user.id), integration: { stripeConnected: !!integration?.stripeAccountId, stripeReady: !!integration?.stripeReady, calConnected: !!(integration?.calApiKeyEncrypted || integration?.calAccessTokenEncrypted), calLink: integration?.calLink ?? "", telegramConnected: telegramStatus(state, user).connected }, metrics: calculateMetrics(state, user.id), diagnostics: diagnosticMetrics(state, user.id), demo });
}
