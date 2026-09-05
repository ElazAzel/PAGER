import "server-only";
import type { CatalogItem, DatabaseState, Order } from "../types";
import { ApiError } from "./http";
import { itemSchema } from "./validation";
import { assetIdsInData, safeUrl, sanitizeRichText } from "./sanitize";

export function saveItem(state: DatabaseState, ownerId: string, input: CatalogItem): CatalogItem {
  const item = itemSchema.parse(input);
  if (item.ownerId !== ownerId || !state.pages.some(p => p.id === item.pageId && p.ownerId === ownerId)) throw new ApiError(403, "Item access denied");
  const index = state.items.findIndex(i => i.id === item.id); const existing = state.items[index];
  if (existing && (existing.ownerId !== ownerId || existing.pageId !== item.pageId)) throw new ApiError(403, "Item access denied");
  if (existing && (item.revision === undefined || item.revision !== (existing.revision ?? 0))) throw new ApiError(409, "Item changed; reload before saving / Товар изменился. Обновите данные перед сохранением");
  if (!existing && (item.revision ?? 0) !== 0) throw new ApiError(400, "A new item must start at revision zero");
  if (existing && state.orders.some(o => o.itemId === item.id) && existing.kind !== item.kind) throw new ApiError(409, "Sold item kind cannot change");
  if (!existing && item.reserved !== 0) throw new ApiError(400, "Reserved inventory is managed by checkout");
  if (existing && item.reserved !== existing.reserved) throw new ApiError(409, "Inventory changed; reload the item");
  if (item.stock !== null && item.stock < item.reserved) throw new ApiError(409, "Stock cannot be below active reservations");
  if (item.kind === "physical" && item.stock === null) throw new ApiError(400, "Physical stock is required");
  if (new Set(item.shipping.map(s => s.country)).size !== item.shipping.length) throw new ApiError(400, "Duplicate shipping countries");
  for (const id of assetIdsInData({ image: item.image, fileId: item.fileId })) if (!state.assets.some(a => a.id === id && a.ownerId === ownerId && a.pageId === item.pageId)) throw new ApiError(400, "Invalid asset reference");
  item.description = sanitizeRichText(item.description); if (item.image) item.image = safeUrl(item.image, true); if (item.calLink) item.calLink = safeUrl(item.calLink);
  item.createdAt = existing?.createdAt ?? new Date().toISOString();
  // Every catalog edit and checkout inventory transition advances this token.
  // Comparing reservations alone misses a completed reservation/payment cycle.
  item.revision = (existing?.revision ?? 0) + 1;
  // Keep server/integration extension fields if the shared type grows.
  const merged = { ...existing, ...item };
  if (index >= 0) state.items[index] = merged; else state.items.push(merged); return structuredClone(merged);
}
export function fulfillOrder(state: DatabaseState, ownerId: string, id: string, fulfillment: Order["fulfillment"], tracking?: string): Order {
  const order = state.orders.find(o => o.id === id && o.ownerId === ownerId); if (!order) throw new ApiError(404, "Order not found");
  if (order.status !== "paid") throw new ApiError(409, "Only a confirmed paid order can be fulfilled");
  const item = state.items.find(i => i.id === order.itemId && i.ownerId === ownerId);
  if (["shipped", "delivered"].includes(fulfillment) && item?.kind !== "physical") throw new ApiError(400, "Shipping applies to physical products");
  const sequence = ["unfulfilled", "processing", "shipped", "delivered"];
  if (sequence.indexOf(fulfillment) < sequence.indexOf(order.fulfillment)) throw new ApiError(409, "Fulfillment cannot move backwards");
  order.fulfillment = fulfillment; if (tracking !== undefined) order.tracking = tracking.trim().slice(0, 500); return structuredClone(order);
}
