import "server-only";
import type { DatabaseState, Page } from "../types";
import { ApiError } from "./http";
import { pageSchema } from "./validation";
import { assetIdsInData, sanitizeBlockData } from "./sanitize";

const reservedSlugs = new Set(["api", "admin", "dashboard", "editor", "login", "auth", "checkout", "purchases", "settings", "demo", "favicon", "_next"]);
function validatePage(state: DatabaseState, ownerId: string, input: Page): Page {
  const page = pageSchema.parse(input);
  if (page.ownerId !== ownerId || !state.pages.some(p => p.id === page.id && p.ownerId === ownerId)) throw new ApiError(403, "Page access denied");
  if (reservedSlugs.has(page.slug) || [...state.pages, ...state.publishedPages].some(p => p.id !== page.id && p.slug === page.slug)) throw new ApiError(409, "Slug unavailable");
  if (new Set(page.blocks.map(b => b.id)).size !== page.blocks.length) throw new ApiError(400, "Duplicate block IDs");
  if (page.paid && !page.pricing.oneTime && !page.pricing.monthly) throw new ApiError(400, "Page price required");
  for (const block of page.blocks) {
    if (block.paid && !block.pricing.oneTime && !block.pricing.monthly) throw new ApiError(400, "Block price required");
    for (const itemId of block.data.itemIds ?? []) if (!state.items.some(i => i.id === itemId && i.ownerId === ownerId && i.pageId === page.id)) throw new ApiError(400, "Invalid item reference");
    for (const assetId of assetIdsInData(block.data)) if (!state.assets.some(a => a.id === assetId && a.ownerId === ownerId && a.pageId === page.id)) throw new ApiError(400, "Invalid asset reference");
    block.data = sanitizeBlockData(block.data, block.type === "custom_code");
    if (block.type !== "custom_code" && block.type !== "scratch") delete block.data.code;
  }
  return page;
}
export function savePage(state: DatabaseState, ownerId: string, input: Page): Page {
  const page = validatePage(state, ownerId, input);
  const index = state.pages.findIndex(p => p.id === page.id && p.ownerId === ownerId); const previous = state.pages[index];
  if (page.revision !== previous.revision) throw new ApiError(409, "Draft changed; reload before saving / Черновик изменился");
  preserveSoldBlocks(state, page, previous);
  page.revision = previous.revision + 1; page.updatedAt = new Date().toISOString(); page.publishedAt = previous.publishedAt;
  state.pages[index] = page; return structuredClone(page);
}
function preserveSoldBlocks(state: DatabaseState, page: Page, previous: Page): void {
  const published = state.publishedPages.find(p => p.id === page.id && p.ownerId === page.ownerId);
  for (const old of [...(published?.blocks ?? []), ...previous.blocks]) {
    if (page.blocks.some(b => b.id === old.id)) continue;
    const sold = old.archived || state.entitlements.some(e => e.pageId === page.id && e.ownerId === page.ownerId && (e.scope === "page" || e.blockId === old.id)) || state.orders.some(o => o.pageId === page.id && o.ownerId === page.ownerId && (o.scope === "page" || o.blockId === old.id));
    if (sold) page.blocks.push({ ...structuredClone(old), archived: true, hidden: false });
  }
}
export function publishPage(state: DatabaseState, ownerId: string): Page {
  const existing = state.pages.find(p => p.ownerId === ownerId); if (!existing) throw new ApiError(404, "Page not found");
  const candidate = structuredClone(existing);
  // A purchase may have arrived after the draft save. Reconcile against the latest
  // transaction state before replacing the publication.
  preserveSoldBlocks(state, candidate, existing);
  const page = validatePage(state, ownerId, candidate);
  page.publishedAt = new Date().toISOString(); page.updatedAt = page.publishedAt; page.revision += 1;
  state.pages[state.pages.findIndex(p => p.id === page.id)] = page;
  const index = state.publishedPages.findIndex(p => p.id === page.id);
  if (index >= 0) state.publishedPages[index] = structuredClone(page); else state.publishedPages.push(structuredClone(page));
  return structuredClone(page);
}
