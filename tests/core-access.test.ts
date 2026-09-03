import { describe, expect, it } from "vitest";
import type { Entitlement } from "../src/lib/types";
import { createDemoState } from "../src/lib/server/seed";
import { canAccessBlock, canAccessItem, projectPage, publicItems } from "../src/lib/server/access";
import { canAccessAsset } from "../src/lib/server/assets";
import { purchaseLibrary } from "../src/lib/server/purchases";

describe("public access boundaries", () => {
  const grant = (scope: Entitlement["scope"] = "block"): Entitlement => ({ id: "grant", ownerId: "creator-anna", buyerId: "buyer-primary", pageId: "page-anna", blockId: "anna-library", scope, orderId: "order", status: "active", expiresAt: null, createdAt: "2026-01-01T00:00:00.000Z" });
  it("serializes neither a gated body nor unpublished / hidden content", () => {
    const state = createDemoState();
    const page = state.publishedPages[0];
    page.blocks[0].hidden = true;
    const secret = page.blocks.find(b => b.id === "anna-library")!;
    secret.data = { text: "TOP_SECRET", code: "PRIVATE_CODE", fileId: "PRIVATE_FILE" };
    const json = JSON.stringify(projectPage(page, undefined, [], true));
    expect(json).not.toMatch(/TOP_SECRET|PRIVATE_CODE|PRIVATE_FILE|ownerId/);
    expect(projectPage(page, undefined, [], true).blocks.some(b => b.id === page.blocks[0].id)).toBe(false);
  });
  it("isolates grants by buyer, creator, page, scope, status and paid-through", () => {
    const page = createDemoState().publishedPages[0];
    const block = page.blocks.find(b => b.id === "anna-library")!;
    expect(canAccessBlock(page, block, "buyer-primary", [grant()])).toBe(true);
    for (const patch of [{ buyerId: "buyer-secondary" }, { ownerId: "creator-other" }, { pageId: "other-page" }, { status: "revoked" as const }, { status: "suspended" as const }, { expiresAt: "2020-01-01T00:00:00Z" }, { expiresAt: "bad-date" }, { blockId: "other-block" }, { scope: "item" as const }]) {
      expect(canAccessBlock(page, block, "buyer-primary", [{ ...grant(), ...patch }])).toBe(false);
    }
    expect(canAccessBlock(page, block, undefined, [grant()])).toBe(false);
    expect(canAccessBlock(page, block, "buyer-primary", [{ ...grant(), status: "revoked" }, grant("page")])).toBe(true);
  });
  it("page grants unlock future blocks, block grants do not bypass a page paywall", () => {
    const page = createDemoState().publishedPages[0];
    const block = { ...page.blocks[1], id: "future", paid: true };
    expect(canAccessBlock(page, block, "buyer-primary", [grant("page")])).toBe(true);
    page.paid = true;
    expect(canAccessBlock(page, page.blocks[0], undefined, [])).toBe(false);
    expect(canAccessBlock(page, block, "buyer-primary", [{ ...grant(), blockId: "future" }])).toBe(false);
  });
  it("archives retain purchased access, but disappear for visitors and cannot grant item access through a hidden origin", () => {
    const state = createDemoState();
    const page = state.publishedPages[0];
    const block = page.blocks.find(b => b.id === "anna-library")!;
    block.archived = true;
    expect(canAccessBlock(page, block, undefined, [])).toBe(false);
    expect(canAccessBlock(page, block, "buyer-primary", [grant()])).toBe(true);
    expect(projectPage(page, undefined, [], true).blocks.some(b => b.id === block.id)).toBe(false);
    const catalog = page.blocks.find(b => b.type === "catalog")!;
    const item = state.items.find(i => i.id === catalog.data.itemIds![0])!;
    expect(canAccessItem(state, item, undefined, catalog.id)).toBe(true);
    catalog.hidden = true;
    expect(canAccessItem(state, item, undefined, catalog.id)).toBe(false);
  });
  it("never exposes digital file IDs from a public item or block without the item purchase", () => {
    const state = createDemoState();
    const item = state.items.find(i => i.kind === "digital")!;
    item.fileId = "PRIVATE_DIGITAL_ASSET";
    const page = state.publishedPages[0];
    expect(JSON.stringify(publicItems(state, page))).not.toContain("PRIVATE_DIGITAL_ASSET");
    expect(publicItems(state, page).some(i => i.id === item.id)).toBe(true);
  });
  it("retains entitled archived catalog details and independently purchased archived digital delivery", () => {
    const state = createDemoState(); const page = state.publishedPages[0];
    const catalog = page.blocks.find(b => b.type === "catalog")!; catalog.archived = true;
    const item = state.items.find(i => i.id === "anna-workbook")!;
    state.entitlements = [{ ...grant(), blockId: catalog.id }];
    expect(canAccessItem(state, item, undefined, catalog.id)).toBe(false);
    expect(canAccessItem(state, item, "buyer-primary", catalog.id)).toBe(true);
    expect(publicItems(state, page, "buyer-primary").some(i => i.id === item.id)).toBe(true);
    state.entitlements = [{ ...grant("item"), itemId: item.id }];
    catalog.hidden = true;
    expect(canAccessItem(state, item, "buyer-primary", catalog.id)).toBe(false);
    expect(purchaseLibrary(state, state.users[2], true).items[0].fileId).toBe("anna-workbook-file");
    expect(canAccessAsset(state, state.assets[0], "buyer-primary")).toBe(true);
    expect(purchaseLibrary(state, state.users[3], true).items).toHaveLength(0);
    expect(canAccessAsset(state, state.assets[0], "buyer-secondary")).toBe(false);
  });
  it.each(["block", "page"] as const)("delivers hidden sold material through the library and assets with a valid %s grant only", scope => {
    const state = createDemoState(); const page = state.publishedPages[0];
    const block = page.blocks.find(b => b.id === "anna-library")!;
    block.hidden = true; block.data = { text: "HIDDEN_PURCHASE", fileId: "retained-file" };
    const asset = { ...state.assets[0], id: "retained-file", path: "retained.txt" }; state.assets.push(asset);
    state.entitlements = [grant(scope)];
    // Public block gates and composition stay hidden even for the purchasing buyer.
    expect(canAccessBlock(page, block, "buyer-primary", state.entitlements)).toBe(false);
    expect(projectPage(page, "buyer-primary", state.entitlements, true).blocks.some(b => b.id === block.id)).toBe(false);
    const retained = purchaseLibrary(state, state.users[2], true).pages[0].blocks.find(b => b.id === block.id);
    expect(retained).toMatchObject({ hidden: true, locked: false, data: { text: "HIDDEN_PURCHASE", fileId: "retained-file" } });
    expect(canAccessAsset(state, asset, "buyer-primary")).toBe(true);
    expect(canAccessAsset(state, asset)).toBe(false);
    expect(canAccessAsset(state, asset, "buyer-secondary")).toBe(false);
    expect(JSON.stringify(purchaseLibrary(state, state.users[3], true))).not.toContain("HIDDEN_PURCHASE");
    // Retained access is still revoked, scoped and subject to the whole-page gate.
    for (const patch of [{ status: "revoked" as const }, { status: "suspended" as const }, { expiresAt: "2020-01-01T00:00:00Z" }, { ownerId: "creator-other" }, { pageId: "page-other" }, { buyerId: "buyer-secondary" }, { scope: "item" as const }, { scope: "block" as const, blockId: "different-block" }]) {
      state.entitlements = [{ ...grant(scope), ...patch }];
      expect(canAccessAsset(state, asset, "buyer-primary")).toBe(false);
      expect(JSON.stringify(purchaseLibrary(state, state.users[2], true))).not.toContain("HIDDEN_PURCHASE");
    }
    state.entitlements = [grant()]; page.paid = true;
    expect(canAccessAsset(state, asset, "buyer-primary")).toBe(false);
    expect(JSON.stringify(purchaseLibrary(state, state.users[2], true))).not.toContain("HIDDEN_PURCHASE");
    state.entitlements.push(grant("page"));
    expect(canAccessAsset(state, asset, "buyer-primary")).toBe(true);
    expect(state.publishedPages[0].blocks.find(b => b.id === block.id)?.hidden).toBe(true);
  });
  it("keeps unsold hidden blocks private and item delivery separately gated in the purchase library", () => {
    const state = createDemoState(); const page = state.publishedPages[0];
    const free = page.blocks[0]; free.hidden = true; free.data = { text: "UNSOLD_HIDDEN", fileId: "unsold-file" };
    const asset = { ...state.assets[0], id: "unsold-file", path: "unsold.txt" }; state.assets.push(asset);
    const sold = page.blocks.find(b => b.id === "anna-library")!; sold.hidden = true;
    sold.data = { text: "PURCHASED_BODY", fileId: "anna-workbook-file", url: "/api/assets/anna-workbook-file" };
    state.entitlements = [grant()];
    const library = JSON.stringify(purchaseLibrary(state, state.users[2], true));
    expect(library).toContain("PURCHASED_BODY");
    expect(library).not.toMatch(/UNSOLD_HIDDEN|anna-workbook-file/);
    expect(canAccessAsset(state, asset, "buyer-primary")).toBe(false);
    expect(canAccessAsset(state, state.assets[0], "buyer-primary")).toBe(false);
  });
  it("gates every uploaded image field and item files through the published reference", () => {
    const state = createDemoState();
    const asset = { id: "secret-image", ownerId: "creator-anna", pageId: "page-anna", filename: "private.png", mime: "image/png", path: "private.png", size: 1, createdAt: new Date().toISOString() };
    state.assets.push(asset);
    const block = state.publishedPages[0].blocks.find(b => b.id === "anna-library")!;
    for (const data of [{ image: "/api/assets/secret-image" }, { avatar: "/api/assets/secret-image" }, { beforeImage: "/api/assets/secret-image" }, { afterImage: "/api/assets/secret-image" }, { items: [{ image: "/api/assets/secret-image" }] }, { items: [{ icon: "/api/assets/secret-image" }] }, { fileId: "secret-image" }]) {
      block.data = data;
      expect(canAccessAsset(state, asset, undefined)).toBe(false);
      expect(canAccessAsset(state, asset, "buyer-secondary")).toBe(false);
      expect(canAccessAsset({ ...state, entitlements: [grant()] }, asset, "buyer-primary")).toBe(true);
    }
    block.paid = false;
    block.data = { image: "/api/assets/secret-image" };
    state.items.find(i => i.kind === "digital")!.fileId = asset.id;
    expect(canAccessAsset(state, asset, undefined)).toBe(false);
    expect(canAccessAsset(state, asset, "creator-other")).toBe(false);
    expect(canAccessAsset(state, asset, "creator-anna")).toBe(true);
  });
});
