import "server-only";
import type { Block, CatalogItem, DatabaseState, Entitlement, Page, PublicPage } from "../types";
import { sanitizeBlockData } from "./sanitize";

export function validGrant(grant: Entitlement, page: Page, userId: string | undefined, now = new Date()): boolean {
  return !!userId && grant.buyerId === userId && grant.ownerId === page.ownerId && grant.pageId === page.id && grant.status === "active" && (grant.expiresAt === null || Date.parse(grant.expiresAt) > now.getTime());
}
export function canAccessBlock(page: Page, block: Block, userId: string | undefined, entitlements: Entitlement[], now = new Date()): boolean {
  // Hidden blocks never open public composition, item origins or booking flows.
  return (userId === page.ownerId || !block.hidden) && canReadBlockMaterial(page, block, userId, entitlements, now);
}
// Material delivery is independent of visibility, but still requires an active,
// tenant-scoped purchase for every hidden/archived block (including free ones).
export function canReadBlockMaterial(page: Page, block: Block, userId: string | undefined, entitlements: Entitlement[], now = new Date()): boolean {
  if (userId === page.ownerId) return true;
  const grants = entitlements.filter(e => validGrant(e, page, userId, now));
  const wholePage = grants.some(e => e.scope === "page");
  const thisBlock = grants.some(e => e.scope === "block" && e.blockId === block.id);
  if (page.paid && !wholePage) return false;
  if (block.hidden || block.archived) return wholePage || thisBlock;
  return !block.paid || wholePage || thisBlock;
}
export function projectPage(page: Page, userId: string | undefined, entitlements: Entitlement[], demo: boolean): PublicPage {
  return projectPageContent(page, userId, entitlements, demo, false);
}
function projectPageContent(page: Page, userId: string | undefined, entitlements: Entitlement[], demo: boolean, includePurchasedHidden: boolean): PublicPage {
  const owner = userId === page.ownerId;
  const pageAccess = owner || !page.paid || entitlements.some(e => e.scope === "page" && validGrant(e, page, userId));
  const canRead = includePurchasedHidden ? canReadBlockMaterial : canAccessBlock;
  // Explicit allowlist: Page may later acquire server-only properties.
  return { id: page.id, slug: page.slug, title: page.title, description: pageAccess ? page.description : page.teaser, locale: page.locale, accent: page.accent, paid: page.paid, teaser: page.teaser, pricing: { ...page.pricing }, publishedAt: page.publishedAt, updatedAt: page.updatedAt, revision: page.revision, owner, demo, locked: !pageAccess,
    blocks: page.blocks.filter(b => owner || (b.hidden ? includePurchasedHidden && canRead(page, b, userId, entitlements) : !b.archived || canRead(page, b, userId, entitlements))).map(b => {
      const accessible = canRead(page, b, userId, entitlements);
      return { id: b.id, type: b.type, width: b.width, hidden: b.hidden, archived: b.archived, paid: b.paid, teaser: b.teaser, pricing: { ...b.pricing }, locked: !accessible, ...(accessible ? { data: sanitizeBlockData(b.data, b.type === "custom_code") } : {}) };
    }),
  };
}
export function hasItemGrant(state: DatabaseState, item: CatalogItem, userId?: string): boolean {
  if (!userId) return false;
  return state.entitlements.some(e => e.ownerId === item.ownerId && e.pageId === item.pageId && e.buyerId === userId && e.scope === "item" && e.itemId === item.id && e.status === "active" && (e.expiresAt === null || Date.parse(e.expiresAt) > Date.now()));
}
export function canAccessItem(state: DatabaseState, item: CatalogItem, userId?: string, sourceBlockId?: string): boolean {
  if (userId === item.ownerId) return true;
  const page = state.publishedPages.find(p => p.id === item.pageId && p.ownerId === item.ownerId && !!p.publishedAt);
  if (!page) return false;
  return page.blocks.some(block => (!sourceBlockId || block.id === sourceBlockId) && !block.hidden && block.data.itemIds?.includes(item.id) && canAccessBlock(page, block, userId, state.entitlements));
}
export function projectItem(state: DatabaseState, item: CatalogItem, userId?: string): CatalogItem {
  const result = structuredClone(item);
  if (userId !== item.ownerId && !hasItemGrant(state, item, userId)) delete result.fileId;
  return result;
}
export function publicItems(state: DatabaseState, page: Page, userId?: string): CatalogItem[] {
  return state.items.filter(item => item.ownerId === page.ownerId && item.pageId === page.id && canAccessItem(state, item, userId)).map(item => projectItem(state, item, userId));
}
// Requires state to identify protected digital files accidentally reused in an open block.
export function projectPublicPage(state: DatabaseState, page: Page, userId?: string, demo = false, includePurchasedHidden = false): PublicPage {
  // Only purchaseLibrary opts in; public routes always use the default projection.
  const result = projectPageContent(page, userId, state.entitlements, demo, includePurchasedHidden);
  if (userId === page.ownerId) return result;
  const blockedIds = state.items.filter(i => i.ownerId === page.ownerId && i.pageId === page.id && i.fileId && !hasItemGrant(state, i, userId)).map(i => i.fileId!);
  for (const block of result.blocks) if (block.data) {
    if (block.data.fileId && blockedIds.includes(block.data.fileId)) delete block.data.fileId;
    const scrub = (value: unknown): unknown => {
      if (typeof value === "string" && blockedIds.some(id => value.includes(`/api/assets/${id}`))) return "";
      if (Array.isArray(value)) return value.map(scrub);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
      return value;
    };
    block.data = scrub(block.data) as typeof block.data;
  }
  return result;
}
