import "server-only";
import type { DatabaseState, User } from "../types";
import { hasItemGrant, projectItem, projectPublicPage } from "./access";

export function purchaseLibrary(state: DatabaseState, user: User, demo: boolean) {
  const orders = state.orders.filter(o => o.buyerId === user.id);
  const subscriptions = state.subscriptions.filter(s => s.buyerId === user.id);
  const entitlements = state.entitlements.filter(e => e.buyerId === user.id);
  const bookings = state.bookings.filter(b => b.buyerId === user.id);
  const pageIds = new Set([...orders, ...subscriptions, ...entitlements, ...bookings].map(row => row.pageId));
  // Item grants intentionally bypass a now-hidden or archived selling block in the
  // personal library. They do not bypass the public product's originating gate.
  const items = state.items.filter(item => hasItemGrant(state, item, user.id)).map(item => projectItem(state, item, user.id));
  return structuredClone({ orders: orders.map(stripPrivateMetadata), subscriptions: subscriptions.map(stripPrivateMetadata), entitlements, bookings: bookings.map(stripPrivateMetadata), pages: state.publishedPages.filter(p => p.publishedAt && pageIds.has(p.id)).map(p => projectPublicPage(state, p, user.id, demo, true)), items, demo });
}
function stripPrivateMetadata<T extends object>(value: T): T {
  const result = { ...value } as T & { commerce?: unknown }; delete result.commerce; return result;
}
