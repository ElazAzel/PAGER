import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppearanceSurface } from "../src/app/ui/appearance-surface";
import { BlockRenderer } from "../src/app/ui/block-renderer";
import { AuthModal, PublicPageScreen, ItemDetailScreen } from "../src/app/ui/public-page";
import { BlockTypePicker, PageView } from "../src/app/ui/page-editor";
import { LibraryTabs } from "../src/app/ui/buyer-pages";
import { applyAppearancePreset } from "../src/lib/appearance";
import { BLOCK_TYPES } from "../src/lib/types";
import { createBlock } from "../src/lib/blocks";
import { createDemoState } from "../src/lib/server/seed";
import { projectPublicPage } from "../src/lib/server/access";
import type { DashboardData } from "../src/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("progressively enhanced author appearance", () => {
  it("renders a readable themed surface before JavaScript runs", () => {
    const html = renderToStaticMarkup(createElement(AppearanceSurface, { appearance: { theme: "midnight", entrance: "rise", pattern: "dots" }, accent: "#ffffff" }, "Visible content"));
    expect(html).toContain("Visible content");
    expect(html).toContain('data-page-theme="midnight"');
    expect(html).toContain('data-page-pattern="dots"');
    expect(html).toContain("--paper:#121b26");
    expect(html).not.toMatch(/opacity:0|visibility:hidden|data-reveal="true"/);
  });

  it.each(BLOCK_TYPES)("preserves the %s block and finite per-block effects", type => {
    const block = createBlock(type, "en");
    if (type === "before_after") { block.data.beforeImage = "/example-before.jpg"; block.data.afterImage = "/example-after.jpg"; }
    block.appearance = { entrance: "fade", hover: "none" };
    const html = renderToStaticMarkup(createElement(BlockRenderer, { block, locale: "en", appearance: { entrance: "rise", hover: "lift" }, sequence: 2 }));
    expect(html).toContain(`id="block-${block.id}"`);
    expect(html).toContain('data-entrance="fade"');
    expect(html).toContain('data-hover="none"');
    expect(html).toContain("--appearance-delay:80ms");
    expect(html).not.toContain('data-reveal="true"');
  });

  it("styles a locked teaser without rendering its protected material", () => {
    const state = createDemoState(); const page = applyAppearancePreset(state.publishedPages[0], "midnight");
    const publicPage = projectPublicPage(state, page);
    const block = publicPage.blocks.find(b => b.id === "anna-library")!;
    const html = renderToStaticMarkup(createElement(BlockRenderer, { block, appearance: page.appearance }));
    expect(html).toContain("locked-block");
    expect(html).toContain('data-entrance="scale"');
    expect(html).not.toContain("anna-workbook-file");
  });

  it("applies the saved appearance to public pages and item detail pages", () => {
    const state = createDemoState(); const page = applyAppearancePreset(state.publishedPages[0], "rose");
    const publicPage = projectPublicPage(state, page);
    const html = renderToStaticMarkup(createElement(PublicPageScreen, { slug: page.slug, initialPage: publicPage }));
    expect(html).toContain('data-page-theme="rose"');
    expect(html).toContain('data-entrance="fade"');
    expect(html).not.toContain("anna-workbook-file");
    const detail = renderToStaticMarkup(createElement(ItemDetailScreen, { slug: page.slug, itemId: state.items[0].id, initialPage: publicPage, initialItem: state.items[0] }));
    expect(detail).toContain('data-page-theme="rose"');
    expect(detail).toContain(state.items[0].title);
  });

  it("does not animate hidden or archived blocks and keeps drag controls separate", () => {
    const block = createBlock("text", "en");
    block.hidden = true;
    expect(renderToStaticMarkup(createElement(BlockRenderer, { block, appearance: { entrance: "rise" } }))).toBe("");
    block.hidden = false; block.archived = true;
    expect(renderToStaticMarkup(createElement(BlockRenderer, { block, appearance: { entrance: "rise" } }))).toBe("");
    const editor = renderToStaticMarkup(createElement(BlockRenderer, { block, editor: true, appearance: { entrance: "rise" } }));
    expect(editor).toContain("editor-block");
    expect(editor).not.toContain("data-entrance");
  });

  it("keeps unconfigured media states honest instead of creating dead links", () => {
    const map = createBlock("map", "en");
    const shoutout = createBlock("shoutout", "en");
    const video = createBlock("video", "en");
    map.data.url = "";
    shoutout.data.url = "";
    const mapHtml = renderToStaticMarkup(createElement(BlockRenderer, { block: map, locale: "en" }));
    const shoutoutHtml = renderToStaticMarkup(createElement(BlockRenderer, { block: shoutout, locale: "en" }));
    const videoHtml = renderToStaticMarkup(createElement(BlockRenderer, { block: video, locale: "en" }));
    expect(mapHtml).not.toContain('href="#"');
    expect(shoutoutHtml).not.toContain('href="#"');
    expect(videoHtml).toContain('role="status"');
  });

  it("renders author-provided alternative text for visual blocks", () => {
    const image = createBlock("image", "en");
    Object.assign(image.data, { image: "/portrait.jpg", alt: "Portrait in a studio" });
    const gallery = createBlock("carousel", "en");
    Object.assign(gallery.data, { items: [{ image: "/work.jpg", alt: "Workshop table with notes" }] });
    const compare = createBlock("before_after", "en");
    Object.assign(compare.data, { beforeImage: "/before.jpg", afterImage: "/after.jpg", beforeAlt: "Before the session", afterAlt: "After the session" });
    expect(renderToStaticMarkup(createElement(BlockRenderer, { block: image, locale: "en" }))).toContain('alt="Portrait in a studio"');
    expect(renderToStaticMarkup(createElement(BlockRenderer, { block: gallery, locale: "en" }))).toContain('alt="Workshop table with notes"');
    const compareHtml = renderToStaticMarkup(createElement(BlockRenderer, { block: compare, locale: "en" }));
    expect(compareHtml).toContain('alt="Before the session"');
    expect(compareHtml).toContain('alt="After the session"');
  });

  it("exposes editor view switching as an accessible tablist and panel", () => {
    const state = createDemoState();
    const data = {
      user: state.users.find(user => user.role === "creator")!,
      page: structuredClone(state.pages[0]),
      items: state.items,
      contacts: state.contacts,
      opportunities: state.opportunities,
      bookings: state.bookings,
      orders: state.orders,
      timeline: state.timeline,
      integration: { stripeConnected: false, stripeReady: false, calConnected: false, calLink: "", telegramConnected: false },
      metrics: { views: 0, clicks: 0, conversions: 0, northStar: 0, revenue: 0, repeatContacts: 0, activePages: 1 },
      demo: true,
    } satisfies DashboardData;
    const html = renderToStaticMarkup(createElement(PageView, { data, locale: "ru", onPage: () => undefined, publish: async () => undefined, saveState: { status: "saved" } }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"');
  });

  it("gives public dialogs localized close and description semantics", () => {
    const html = renderToStaticMarkup(createElement(AuthModal, { locale: "ru", onClose: () => undefined, onComplete: () => undefined }));
    expect(html).toContain('aria-label="Закрыть"');
    expect(html).toContain('aria-describedby=');
  });

  it("explains block choices before asking the author to configure them", () => {
    const html = renderToStaticMarkup(createElement(BlockTypePicker, { locale: "ru", onSelect: () => undefined }));
    expect(html).toContain("Сравнение с интерактивным ползунком");
    expect(html).toContain("block-type-copy");
  });

  it("keeps the buyer library tabs and panels programmatically connected", () => {
    const html = renderToStaticMarkup(createElement(LibraryTabs, { locale: "ru", tab: "pages", onTabChange: () => undefined }));
    expect(html).toContain('id="library-tab-pages"');
    expect(html).toContain('aria-controls="library-pages-panel"');
    expect(html).toContain('aria-controls="library-items-panel"');
  });
});
