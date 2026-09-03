import "server-only";
import type { DatabaseState } from "../types";
import { isDeepStrictEqual } from "node:util";

export const COLLECTIONS = ["users", "pages", "publishedPages", "items", "contacts", "opportunities", "bookings", "orders", "subscriptions", "entitlements", "timeline", "integrations", "analytics", "assets", "webhooks", "notifications"] as const satisfies ReadonlyArray<keyof DatabaseState>;
export type Collection = typeof COLLECTIONS[number];
export type StateRow = DatabaseState[Collection][number];
export type Change = { collection: Collection; operation: "upsert" | "delete"; id: string; row: StateRow };
export const TABLE_NAMES: Record<Collection, string> = { users: "pager_users", pages: "pager_pages", publishedPages: "pager_published_pages", items: "pager_items", contacts: "pager_contacts", opportunities: "pager_opportunities", bookings: "pager_bookings", orders: "pager_orders", subscriptions: "pager_subscriptions", entitlements: "pager_entitlements", timeline: "pager_timeline", integrations: "pager_integrations", analytics: "pager_analytics", assets: "pager_assets", webhooks: "pager_webhooks", notifications: "pager_notifications" };
export function diffState(before: DatabaseState, after: DatabaseState): Change[] {
  const changes: Change[] = [];
  for (const collection of COLLECTIONS) {
    const previous = new Map<string, StateRow>(before[collection].map(row => [row.id, row]));
    const seen = new Set<string>();
    for (const row of after[collection]) {
      if (!row.id || seen.has(row.id)) throw new Error(`Duplicate or missing ID in ${collection}`);
      seen.add(row.id); const old = previous.get(row.id);
      for (const field of ["ownerId", "buyerId", "pageId"] as const) {
        if (old && field in old && (! (field in row) || (old as unknown as Record<string, unknown>)[field] !== (row as unknown as Record<string, unknown>)[field])) throw new Error(`Immutable ${field} in ${collection}`);
      }
      if (!old || !isDeepStrictEqual(old, row)) changes.push({ collection, operation: "upsert", id: row.id, row });
    }
    for (const old of before[collection]) if (!seen.has(old.id)) changes.push({ collection, operation: "delete", id: old.id, row: old });
  }
  return changes;
}
export function assertStateShape(value: unknown): asserts value is DatabaseState {
  if (!value || typeof value !== "object") throw new Error("Invalid repository state");
  for (const key of COLLECTIONS) {
    const rows = (value as Record<string, unknown>)[key];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || typeof row.id !== "string")) throw new Error(`Invalid collection ${key}`);
  }
}
