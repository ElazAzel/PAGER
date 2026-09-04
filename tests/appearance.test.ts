import { describe, expect, it } from "vitest";
import { appearanceOf, appearanceVariables, appearanceAttributes, applyAppearancePreset, blockEffectAttributes, shouldAnimateAppearance } from "../src/lib/appearance";
import { createDemoState } from "../src/lib/server/seed";
import { savePage, publishPage } from "../src/lib/server/pages";
import { projectPublicPage } from "../src/lib/server/access";
import { pageSchema } from "../src/lib/server/validation";

describe("safe, backwards compatible author appearance", () => {
  it("waits for browser preferences before motion and always respects system reduction", () => {
    expect(shouldAnimateAppearance(undefined, false)).toBe(false);
    expect(shouldAnimateAppearance("reduced", false)).toBe(false);
    expect(shouldAnimateAppearance("standard", true)).toBe(false);
    expect(shouldAnimateAppearance("standard", false)).toBe(true);
  });
  it("renders old publications without requiring a theme migration", () => {
    const state = createDemoState();
    expect(pageSchema.safeParse(state.pages[0]).success).toBe(true);
    expect(appearanceOf(undefined)).toMatchObject({ theme: "paper", entrance: "none", hover: "none" });
    expect(appearanceAttributes(undefined)["data-page-theme"]).toBe("paper");
  });

  it("keeps media descriptions valid at the page save boundary", () => {
    const page = structuredClone(createDemoState().pages[0]);
    page.blocks[0].data = { ...page.blocks[0].data, alt: "Portrait in a studio", beforeAlt: "Before the session", afterAlt: "After the session", items: [{ id: "media-item", image: "/work.jpg", alt: "Workshop table with notes" }] };
    expect(pageSchema.safeParse(page).success).toBe(true);
  });

  it("normalizes untrusted saved styles without admitting CSS or protected values", () => {
    const raw = JSON.parse('{"theme":"midnight","entrance":"evil","font":"url(https://bad.test)","html":"PRIVATE_TEXT","backgroundImage":"/api/assets/secret"}');
    const normalized = appearanceOf(raw);
    expect(normalized).toMatchObject({ theme: "midnight", entrance: "none", font: "editorial" });
    expect(JSON.stringify(normalized)).not.toMatch(/PRIVATE_TEXT|bad.test|\/api\/assets|html/);
    expect(appearanceVariables(raw, "red;position:fixed")["--page-accent"]).toBe("#c16344");
  });

  it("uses a readable foreground on light and dark chosen accents", () => {
    expect(appearanceVariables({ theme: "midnight" }, "#ffffff")["--appearance-on-accent"]).toBe("#111827");
    expect(appearanceVariables({ theme: "paper" }, "#000000")["--appearance-on-accent"]).toBe("#ffffff");
    expect(appearanceVariables({ theme: "midnight" }, "#ffffff")["--paper"]).toBe("#121b26");
  });

  it("changes only appearance and accent when selecting a preset", () => {
    const page = createDemoState().pages[0];
    const before = structuredClone(page);
    const next = applyAppearancePreset(page, "sage");
    expect(page).toEqual(before);
    expect(next.appearance?.theme).toBe("sage");
    const { appearance, accent, ...rest } = next;
    expect(appearance).toBeDefined(); expect(accent).not.toBe(before.accent);
    const { accent: oldAccent, ...original } = before;
    expect(oldAccent).toBeDefined(); expect(rest).toEqual(original);
  });

  it("rejects arbitrary styles at the save boundary, leaving the draft untouched", () => {
    const state = createDemoState(); const page = state.pages[0]; const before = structuredClone(page);
    const invalid = { ...page, appearance: { ...appearanceOf(), css: "body { display:none }" } };
    expect(() => savePage(state, page.ownerId, invalid)).toThrow();
    expect(state.pages[0]).toEqual(before);
    expect(() => savePage(state, page.ownerId, { ...page, appearance: { ...appearanceOf(), speed: "unbounded" } } as never)).toThrow();
  });

  it("keeps visual edits draft-only until atomic publication and preserves paid content gates", () => {
    const state = createDemoState(); const original = state.pages[0];
    const draft = applyAppearancePreset(original, "midnight");
    draft.appearance = { ...draft.appearance!, entrance: "rise", background: "gradient" };
    draft.blocks = draft.blocks.map(block => ({ ...block, appearance: { entrance: "fade", hover: "lift" } }));
    const saved = savePage(state, original.ownerId, draft);
    expect(saved.appearance?.theme).toBe("midnight");
    const beforePublish = projectPublicPage(state, state.publishedPages[0]);
    expect(beforePublish.appearance?.theme).not.toBe("midnight");
    const published = publishPage(state, original.ownerId, saved.revision);
    const publicPage = projectPublicPage(state, published);
    expect(publicPage.appearance).toMatchObject({ theme: "midnight", entrance: "rise" });
    expect(publicPage.blocks.find(b => b.id === "anna-library")).toMatchObject({ locked: true, appearance: { entrance: "fade", hover: "lift" } });
    expect(publicPage.blocks.find(b => b.id === "anna-library")?.data).toBeUndefined();
    expect(JSON.stringify(publicPage)).not.toContain("anna-workbook-file");
    state.pages[0].appearance!.theme = "rose";
    expect(state.publishedPages[0].appearance?.theme).toBe("midnight");
  });

  it("uses a public allowlist even for old records containing unexpected appearance keys", () => {
    const state = createDemoState(); const page = state.publishedPages[0];
    Object.assign(page, { appearance: { theme: "sage", privateText: "PRIVATE_THEME" } });
    Object.assign(page.blocks[0], { appearance: { entrance: "fade", privateText: "PRIVATE_BLOCK" } });
    const result = projectPublicPage(state, page);
    expect(result.appearance?.theme).toBe("sage");
    expect(result.blocks[0].appearance).toEqual({ entrance: "fade" });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_THEME|PRIVATE_BLOCK/);
  });

  it("allows each block to inherit, override, or turn off an effect without changing page effects", () => {
    const page = { ...appearanceOf(), entrance: "rise" as const, hover: "lift" as const };
    expect(blockEffectAttributes(page, undefined)).toEqual({ "data-entrance": "rise", "data-hover": "lift" });
    expect(blockEffectAttributes(page, { entrance: "none", hover: "glow" })).toEqual({ "data-entrance": "none", "data-hover": "glow" });
    expect(blockEffectAttributes(page, { entrance: "inherit", hover: "inherit" })).toEqual({ "data-entrance": "rise", "data-hover": "lift" });
    expect(page.entrance).toBe("rise");
  });
});
