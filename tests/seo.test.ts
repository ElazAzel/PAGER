import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createDemoState } from "../src/lib/server/seed";
import { anonymousItem, canonicalOrigin, itemMetadata, pageDiscovery, publicSitemap, publishedSnapshot, serializeJsonLd } from "../src/lib/server/seo";
import { bookingBlockForItem, publicAction, trafficDevice, trafficSource } from "../src/lib/public-discovery";
import { ItemDetailScreen, PublicPageScreen } from "../src/app/ui/public-page";
import { BlockRenderer } from "../src/app/ui/block-renderer";
import robots from "../src/app/robots";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const origin = "https://pager-live.com";

describe("anonymous search publication", () => {
  it("keeps similarly named author slugs crawlable while excluding private route namespaces", () => {
    vi.stubEnv("PAGER_APP_URL", origin); vi.stubEnv("PAGER_DEMO", "false");
    try {
      const rules = robots().rules;
      const first = Array.isArray(rules) ? rules[0] : rules;
      const blocked = (path: string) => (Array.isArray(first.disallow) ? first.disallow : [first.disallow]).some(pattern => pattern && (pattern.endsWith("$") ? path === pattern.slice(0, -1) : path.startsWith(pattern)));
      for (const slug of ["/admin-anna", "/dashboard-coach", "/analytics", "/clients", "/orders", "/settings"]) expect(blocked(slug)).toBe(false);
      for (const path of ["/admin", "/dashboard", "/api/admin", "/checkout/private-order"]) expect(blocked(path)).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });
  it("indexes only a deliberately configured HTTPS public origin", () => {
    expect(canonicalOrigin(origin, false)).toBe(origin);
    for (const value of [undefined, "", "http://pager-live.com", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://192.168.1.1", "https://demo.local", "https://example.com", "https://pager-live.com/path", "https://user:secret@pager-live.com", "https://pager-live.com?q=x"]) {
      expect(canonicalOrigin(value ?? "", false)).toBeNull();
    }
    expect(canonicalOrigin(origin, true)).toBeNull();
  });

  it("builds metadata and structured data from the publication, without protected or hidden fields", () => {
    const state = createDemoState(); const page = state.publishedPages[0];
    state.pages[0].title = "DRAFT_ONLY_TITLE";
    const profile = page.blocks.find(block => block.type === "profile")!;
    profile.data = { name: "Public Author", profession: "Consultant", text: "Public biography", avatar: "https://cdn.pager-live.com/portrait.jpg" };
    const locked = page.blocks.find(block => block.paid)!;
    locked.data = { name: "PAID_SECRET", text: "PAID_SECRET", avatar: "https://cdn.pager-live.com/PAID_SECRET.jpg", fileId: "PRIVATE_FILE", html: "PRIVATE_CODE" };
    page.blocks.push({ ...profile, id: "hidden-profile", hidden: true, data: { name: "HIDDEN_SECRET" } }, { ...profile, id: "archive-profile", archived: true, data: { name: "ARCHIVED_SECRET" } });
    state.integrations.push({ id: "private-integration", ownerId: page.ownerId, calApiKeyEncrypted: "CREATOR_CREDENTIAL", updatedAt: page.updatedAt });
    const result = pageDiscovery(state, page, false, origin);
    expect(result.indexable).toBe(true);
    expect(result.metadata.alternates).toEqual({ canonical: `${origin}/${page.slug}` });
    expect(result.jsonLd).toMatchObject({ "@type": "ProfilePage", inLanguage: "ru", mainEntity: { "@type": "Person", name: "Public Author", jobTitle: "Consultant" } });
    expect(JSON.stringify(result)).not.toMatch(/DRAFT_ONLY_TITLE|PAID_SECRET|HIDDEN_SECRET|ARCHIVED_SECRET|PRIVATE_FILE|PRIVATE_CODE|CREATOR_CREDENTIAL|ownerId|buyerId|entitlements/);
  });

  it("keeps demo and whole-page paywalls noindex and never emits their structured body", () => {
    const state = createDemoState(); const page = state.publishedPages[0];
    expect(pageDiscovery(state, page, true, origin)).toMatchObject({ indexable: false, jsonLd: null, metadata: { robots: { index: false } } });
    page.paid = true; page.description = "PRIVATE_PAGE_DESCRIPTION"; page.teaser = "Public access teaser";
    const result = pageDiscovery(state, page, false, origin);
    expect(result).toMatchObject({ indexable: false, jsonLd: null, metadata: { description: "Public access teaser", robots: { index: false } } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PAGE_DESCRIPTION");
  });

  it("omits Person when the only profile is paid, and escapes JSON-LD script terminators", () => {
    const state = createDemoState(); const page = state.publishedPages[0];
    page.blocks.filter(block => block.type === "profile").forEach(block => { block.paid = true; block.data.name = "PRIVATE_NAME"; });
    expect(pageDiscovery(state, page, false, origin).jsonLd).toMatchObject({ "@type": "WebPage" });
    expect(JSON.stringify(pageDiscovery(state, page, false, origin))).not.toContain("PRIVATE_NAME");
    const json = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<"); expect(JSON.parse(json).name).toBe("</script><script>alert(1)</script>");
  });

  it("filters the sitemap and item metadata by publication and the exact originating block", () => {
    const state = createDemoState(); const page = state.publishedPages[0];
    const catalog = page.blocks.find(block => block.type === "catalog")!;
    const itemId = catalog.data.itemIds![0];
    const item = state.items.find(candidate => candidate.id === itemId)!;
    item.fileId = "PRIVATE_DIGITAL_FILE";
    expect(anonymousItem(state, page, itemId, catalog.id)?.item.fileId).toBeUndefined();
    expect(anonymousItem(state, page, itemId, "other-tenant-block")).toBeNull();
    expect(itemMetadata(state, page, itemId, false, catalog.id, origin).alternates).toEqual({ canonical: `${origin}/${page.slug}/items/${itemId}` });
    state.publishedPages[1].paid = true;
    const draft = structuredClone(page); draft.id = "unpublished"; draft.slug = "draft-only"; draft.publishedAt = null; state.publishedPages.push(draft);
    let sitemap = publicSitemap(state, false, origin);
    expect(sitemap.some(entry => entry.url.endsWith(`/items/${itemId}`))).toBe(true);
    expect(JSON.stringify(sitemap)).not.toMatch(/draft-only|PRIVATE_DIGITAL_FILE/);
    expect(sitemap.some(entry => entry.url === `${origin}/${state.publishedPages[1].slug}`)).toBe(false);
    for (const property of ["paid", "hidden", "archived"] as const) {
      catalog[property] = true;
      // The same item may occur elsewhere; an explicit protected origin must never borrow its access.
      expect(anonymousItem(state, page, itemId, catalog.id)).toBeNull();
      expect(itemMetadata(state, page, itemId, false, catalog.id, origin)).toMatchObject({ title: { absolute: "PAGER" }, robots: { index: false } });
      catalog[property] = false;
    }
    page.paid = true; sitemap = publicSitemap(state, false, origin);
    expect(sitemap.some(entry => entry.url.includes(`/${page.slug}`))).toBe(false);
    expect(publicSitemap(state, true, origin)).toEqual([]);
  });

  it("renders public text and FAQ answers into initial HTML while omitting private material", () => {
    const state = createDemoState(); const page = state.publishedPages[0];
    const faq = page.blocks.find(block => block.type === "faq")!;
    faq.data.items = [{ title: "Visible question", text: "Answer available without JavaScript" }];
    page.blocks.find(block => block.paid)!.data.text = "PRIVATE_SSR_BODY";
    const snapshot = publishedSnapshot(state, page, false);
    const html = renderToStaticMarkup(createElement(PublicPageScreen, { slug: page.slug, initialPage: snapshot.page, initialItems: snapshot.items }));
    expect(html).toContain(page.title); expect(html).toContain("Answer available without JavaScript");
    expect(html).toContain("<details"); expect(html).toContain('<div lang="ru"');
    expect(html).not.toContain("PRIVATE_SSR_BODY");
    expect(html).not.toContain("Загружаем страницу");
    const isolated = renderToStaticMarkup(createElement(BlockRenderer, { block: snapshot.page.blocks.find(block => block.type === "faq")! }));
    expect(isolated).toContain("<summary"); expect(isolated).toContain("Answer available without JavaScript");
  });
});

describe("conversion and coarse attribution", () => {
  it("does not offer a broken booking from a service catalog without its own accessible booking block", () => {
    const state = createDemoState(); const snapshot = publishedSnapshot(state, state.publishedPages[0], false);
    const service = snapshot.items.find(item => item.kind === "service")!;
    const booking = snapshot.page.blocks.find(block => block.type === "booking")!;
    snapshot.page.blocks = snapshot.page.blocks.filter(block => !["booking", "form"].includes(block.type));
    const catalog = snapshot.page.blocks.find(block => block.type === "catalog")!;
    catalog.data!.itemIds = [service.id];
    expect(publicAction(snapshot.page, [service])).toBeUndefined();
    expect(bookingBlockForItem(snapshot.page, service.id)).toBeUndefined();
    const html = renderToStaticMarkup(createElement(BlockRenderer, { block: catalog, items: [service], slug: snapshot.page.slug, onBook: vi.fn(), bookingOrigin: item => bookingBlockForItem(snapshot.page, item.id) }));
    expect(html).toContain("Подробнее"); expect(html).not.toContain(">Записаться</button>");
    const details = renderToStaticMarkup(createElement(ItemDetailScreen, { slug: snapshot.page.slug, itemId: service.id, initialPage: snapshot.page, initialItem: service, initialBlockId: catalog.id }));
    expect(details).not.toContain("Выбрать время"); expect(details).toContain("Вернуться на страницу");
    snapshot.page.blocks.push(booking); booking.data!.itemIds = [service.id];
    expect(bookingBlockForItem(snapshot.page, service.id)?.id).toBe(booking.id);
    const enabled = renderToStaticMarkup(createElement(BlockRenderer, { block: catalog, items: [service], slug: snapshot.page.slug, onBook: vi.fn(), bookingOrigin: item => bookingBlockForItem(snapshot.page, item.id) }));
    expect(enabled).toContain(">Записаться</button>");
    booking.locked = true; expect(bookingBlockForItem(snapshot.page, service.id)).toBeUndefined();
    booking.locked = false; booking.data!.itemIds = ["different-service"]; expect(bookingBlockForItem(snapshot.page, service.id)).toBeUndefined();
  });
  it("chooses a real public booking CTA and removes it when all eligible actions are gated", () => {
    const state = createDemoState(); const source = state.publishedPages[0];
    const snapshot = publishedSnapshot(state, source, false);
    const action = publicAction(snapshot.page, snapshot.items)!;
    expect(action.block.type).toBe("booking"); expect(action.kind).toBe("booking");
    for (const block of snapshot.page.blocks) if (["booking", "catalog", "pricing", "product", "form"].includes(block.type)) block.locked = true;
    expect(publicAction(snapshot.page, snapshot.items)).toBeUndefined();
    snapshot.page.locked = true; expect(publicAction(snapshot.page, snapshot.items)).toBeUndefined();
  });
  it("classifies only recognized hosts and device categories without forwarding identifying values", () => {
    expect(trafficSource("https://chatgpt.com/c/private-chat?email=secret", origin)).toBe("ai");
    expect(trafficSource("https://www.google.kz/search?q=private", origin)).toBe("search");
    expect(trafficSource("https://google.com.evil.example/private", origin)).toBe("referral");
    expect(trafficSource("https://instagram.com/private-user", origin)).toBe("social");
    expect(trafficSource(`${origin}/other-author`, origin)).toBe("direct");
    expect(trafficSource("", origin)).toBe("direct");
    expect(trafficDevice("Mozilla iPhone Mobile")).toBe("mobile");
    expect(trafficDevice("Mozilla Android Tablet")).toBe("tablet");
    expect(trafficDevice("Mozilla Macintosh", 5)).toBe("tablet");
    expect(trafficDevice("Mozilla Windows Chrome")).toBe("desktop");
  });
});
