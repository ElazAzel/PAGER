import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppearanceControls, BlockAppearanceControls } from "../src/app/ui/appearance-controls";
import type { Block, Locale, Page } from "../src/lib/types";

function makeBlock(): Block {
  return {
    id: "private-resource", type: "download", width: "full", hidden: true,
    paid: true, teaser: "Protected preview", pricing: { oneTime: 4500, currency: "USD" },
    data: { title: "Private resource title", fileId: "private-file-id" },
  };
}

function makePage(): Page {
  return {
    id: "author-page", ownerId: "private-owner-id", slug: "consultant", title: "An author's page",
    description: "Existing description", locale: "ru", accent: "#876543", blocks: [makeBlock()],
    paid: true, teaser: "Existing page teaser", pricing: { monthly: 1200, currency: "USD" },
    publishedAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-02T10:00:00.000Z", revision: 7,
  };
}

function renderPage(page = makePage(), locale: Locale = "en") {
  return renderToStaticMarkup(createElement(AppearanceControls, { page, locale, onChange: vi.fn() }));
}

// Inspect rendered HTML, not component source. Browser event coverage lives with the editor.
function renderedSelect(html: string, label: string) {
  const field = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)]
    .map(match => match[0]).find(markup => markup.includes(`>${label}</span>`));
  expect(field, `A labelled select for ${label}`).toBeDefined();
  expect(field).toContain("<select");
  return field!;
}

function expectSelected(html: string, label: string, value: string) {
  expect(renderedSelect(html, label)).toMatch(new RegExp(`<option value="${value}" selected=""`));
}

describe("page appearance controls", () => {
  it.each([
    { locale: "ru" as const, heading: "Оформление страницы", accent: "Акцентный цвет", font: "Шрифт", reset: "Сбросить оформление", advanced: "Фон и карточки", motion: "Анимация и эффекты", replay: "Повторить анимацию" },
    { locale: "en" as const, heading: "Page appearance", accent: "Accent color", font: "Font", reset: "Reset appearance", advanced: "Background and cards", motion: "Motion and effects", replay: "Replay animation" },
  ])("renders labelled controls and five selectable themes in $locale", ({ locale, heading, accent, font, reset, advanced, motion, replay }) => {
    const html = renderPage(makePage(), locale);
    expect(html).toContain(`>${heading}</h3>`);
    expect(html).toContain(`>${accent}</span>`);
    expect(html).toMatch(/<input[^>]*type="color"[^>]*value="#876543"/);
    expect(renderedSelect(html, font)).toContain('value="editorial"');
    expect(html.match(/aria-pressed="(?:true|false)"/g)).toHaveLength(5);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain(reset);
    expect(html).toContain(replay);
    expect(html).toMatch(new RegExp(`<summary[^>]*>${advanced}`));
    expect(html).toMatch(new RegExp(`<summary[^>]*>${motion}`));
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    for (const button of html.matchAll(/<button\b[^>]*>/g)) expect(button[0]).toContain('type="button"');
  });

  it.each([
    { locale: "en" as const, sample: "Live sample", labels: ["Font", "Background", "Pattern", "Card surface", "Corners", "Spacing", "Shadow", "Button style", "Entrance", "Hover effect", "Motion speed"] },
    { locale: "ru" as const, sample: "Живой пример", labels: ["Шрифт", "Фон", "Узор", "Поверхность карточек", "Углы", "Отступы", "Тень", "Стиль кнопок", "Появление", "При наведении", "Скорость анимации"] },
  ])("reflects every saved appearance choice in $locale", ({ locale, sample, labels }) => {
    const page = makePage();
    page.appearance = {
      theme: "midnight", background: "mesh", pattern: "grid", font: "mono", radius: "sharp",
      spacing: "airy", surface: "glass", shadow: "deep", button: "pill", entrance: "scale", hover: "glow", speed: "slow",
    };
    const html = renderPage(page, locale);
    const values = ["mono", "mesh", "grid", "glass", "sharp", "airy", "deep", "pill", "scale", "glow", "slow"];
    labels.forEach((label, index) => expectSelected(html, label, values[index]));
    const selectedTheme = [...html.matchAll(/<button\b[^>]*>/g)]
      .find(match => match[0].includes('data-appearance-preset="midnight"'))?.[0];
    expect(selectedTheme).toContain('aria-pressed="true"');
    const sampleTag = [...html.matchAll(/<div\b[^>]*>/g)]
      .find(match => match[0].includes(`aria-label="${sample}"`))?.[0];
    expect(sampleTag).toContain('role="group"');
    for (const [name, value] of Object.entries(page.appearance)) {
      expect(sampleTag).toContain(`data-page-${name}="${value}"`);
    }
  });

  it.each([
    { locale: "en" as const, entrance: "Entrance", hover: "Hover effect", off: "Off", reduced: "Your device’s reduced motion setting always takes priority.", preview: "Preview only. This does not publish your page." },
    { locale: "ru" as const, entrance: "Появление", hover: "При наведении", off: "Без эффекта", reduced: "Системная настройка уменьшения движения всегда важнее выбранных эффектов.", preview: "Только пример. Страница не публикуется." },
  ])("offers explicit motion off and explains reduced motion in $locale", ({ locale, entrance, hover, off, reduced, preview }) => {
    const html = renderPage(makePage(), locale);
    expect(renderedSelect(html, entrance)).toMatch(new RegExp(`<option value="none"[^>]*>${off}</option>`));
    expect(renderedSelect(html, hover)).toMatch(new RegExp(`<option value="none"[^>]*>${off}</option>`));
    expect(html).toContain(reduced);
    expect(html).toContain(preview);
  });

  it("renders from frozen author data without exposing private content or making a change", () => {
    const page = makePage();
    Object.freeze(page.pricing);
    Object.freeze(page.blocks[0].data);
    Object.freeze(page.blocks[0]);
    Object.freeze(page.blocks);
    Object.freeze(page);
    const onChange = vi.fn();
    const html = renderToStaticMarkup(createElement(AppearanceControls, { page, locale: "en", onChange }));
    expect(onChange).not.toHaveBeenCalled();
    for (const secret of ["private-resource", "private-owner-id", "Private resource title", "private-file-id", "Existing page teaser"]) {
      expect(html).not.toContain(secret);
    }
    expect(page.pricing.monthly).toBe(1200);
    expect(page.blocks[0].paid).toBe(true);
  });

  it("keeps ids distinct when two panels are rendered in the editor", () => {
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(AppearanceControls, { page: makePage(), locale: "en", onChange: vi.fn() }),
      createElement(AppearanceControls, { page: makePage(), locale: "ru", onChange: vi.fn() }),
    ));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) {
      for (const id of match[1].split(" ")) expect(ids).toContain(id);
    }
  });
});

describe("block appearance overrides", () => {
  it.each([
    { locale: "ru" as const, heading: "Эффекты блока", entrance: "Появление", hover: "При наведении", inherit: "Как на странице", off: "Без эффекта" },
    { locale: "en" as const, heading: "Block effects", entrance: "Entrance", hover: "Hover effect", inherit: "Use page setting", off: "Off" },
  ])("defaults to inheritance and offers explicit off in $locale", ({ locale, heading, entrance, hover, inherit, off }) => {
    const html = renderToStaticMarkup(createElement(BlockAppearanceControls, { block: makeBlock(), locale, onChange: vi.fn() }));
    expect(html).toContain(`>${heading}</h3>`);
    for (const label of [entrance, hover]) {
      const select = renderedSelect(html, label);
      expectSelected(html, label, "inherit");
      expect(select).toContain(`>${inherit}</option>`);
      expect(select).toContain(`>${off}</option>`);
    }
    expect(html).not.toContain('type="color"');
    expect(html).not.toContain("Private resource title");
  });

  it("distinguishes an explicit off override from the page default", () => {
    const block = { ...makeBlock(), appearance: { entrance: "none" as const, hover: "lift" as const } };
    const onChange = vi.fn();
    const html = renderToStaticMarkup(createElement(BlockAppearanceControls, { block, locale: "en", onChange }));
    expectSelected(html, "Entrance", "none");
    expectSelected(html, "Hover effect", "lift");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("inherits an omitted override while retaining the supplied override", () => {
    const block = { ...makeBlock(), appearance: { entrance: "fade" as const } };
    const html = renderToStaticMarkup(createElement(BlockAppearanceControls, { block, locale: "en", onChange: vi.fn() }));
    expectSelected(html, "Entrance", "fade");
    expectSelected(html, "Hover effect", "inherit");
  });
});
