import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyPlatformAppearance,
  createPlatformAppearanceStore,
  isPlatformAppearanceRoute,
  parsePlatformAppearance,
  resolvePlatformMotion,
  type PlatformAppearanceBrowser,
} from "../src/lib/platform-appearance";

afterEach(() => vi.unstubAllGlobals());

function browserFixture(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set("pager:display:v1", initial);
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
  const mediaEvents = new EventTarget();
  let reduced = false;
  const storageListeners = new Set<(event: Pick<StorageEvent, "key" | "newValue" | "storageArea">) => void>();
  const browser: PlatformAppearanceBrowser = {
    localStorage: storage,
    matchMedia: () => ({
      get matches() { return reduced; },
      addEventListener: (_, listener) => mediaEvents.addEventListener("change", listener),
      removeEventListener: (_, listener) => mediaEvents.removeEventListener("change", listener),
    }),
    addEventListener: (_, listener) => { storageListeners.add(listener); },
    removeEventListener: (_, listener) => { storageListeners.delete(listener); },
  };
  return {
    browser,
    storage,
    reduceMotion(value: boolean) {
      reduced = value;
      mediaEvents.dispatchEvent(new Event("change"));
    },
    storageEvent(key: string | null, newValue: string | null, storageArea: Storage = storage) {
      for (const listener of storageListeners) listener({ key, newValue, storageArea });
    },
  };
}

describe("platform display settings", () => {
  it.each([null, undefined, "", "{", "null", "false", "42", "[]", '"dark"']) (
    "uses safe defaults for absent or damaged storage: %s", value => {
      expect(parsePlatformAppearance(value)).toEqual({ theme: "system", motion: "standard" });
    },
  );

  it("accepts known preferences and discards unrelated stored data", () => {
    expect(parsePlatformAppearance('{"theme":"dark","motion":"reduced","account":"ignored"}'))
      .toEqual({ theme: "dark", motion: "reduced" });
  });

  it("recovers valid fields independently without accepting unknown values", () => {
    expect(parsePlatformAppearance('{"theme":"black","motion":"reduced"}'))
      .toEqual({ theme: "system", motion: "reduced" });
    expect(parsePlatformAppearance('{"theme":"light","motion":true}'))
      .toEqual({ theme: "light", motion: "standard" });
  });

  it.each([
    ["standard", false, "standard"],
    ["standard", true, "reduced"],
    ["reduced", false, "reduced"],
    ["reduced", true, "reduced"],
  ] as const)("resolves %s with system reduced motion %s to %s", (motion, system, expected) => {
    expect(resolvePlatformMotion(motion, system)).toBe(expected);
  });

  it.each(["/", "/dashboard", "/dashboard/", "/login", "/purchases", "/checkout", "/checkout/success", "/admin", "/admin/pages", "/privacy", "/terms"])(
    "allows platform controls on %s", path => expect(isPlatformAppearanceRoute(path)).toBe(true),
  );

  it.each([null, "", "/anna", "/anna/items/book", "/dashboard-coach", "/admin-coach", "/checkout-coach", "/privacy/items/book", "/api/health", "/dashboard/items/book"])(
    "does not add platform controls to author or unrelated route %s", path => expect(isPlatformAppearanceRoute(path)).toBe(false),
  );

  it("does not read browser settings for a server snapshot", () => {
    const store = createPlatformAppearanceStore(() => { throw new Error("Browser accessed during SSR"); });
    expect(store.getServerSnapshot()).toMatchObject({ theme: "system", motion: "standard", ready: false });
    expect(store.getSnapshot()).toBe(store.getServerSnapshot());
  });

  it("hydrates from storage and preserves motion when changing just the theme", () => {
    const fixture = browserFixture('{"theme":"dark","motion":"reduced"}');
    fixture.storage.setItem("pager:account", "untouched");
    const store = createPlatformAppearanceStore(() => fixture.browser);
    const stop = store.subscribe(() => {});
    expect(store.getSnapshot()).toMatchObject({ theme: "dark", motion: "reduced", ready: true });
    store.update({ theme: "light" });
    expect(fixture.storage.getItem("pager:display:v1")).toBe('{"theme":"light","motion":"reduced"}');
    expect(fixture.storage.getItem("pager:account")).toBe("untouched");
    expect(store.getServerSnapshot()).toMatchObject({ theme: "system", motion: "standard", ready: false });
    stop();
  });

  it("continues in memory when reading or obtaining localStorage throws", () => {
    const fixture = browserFixture();
    Object.defineProperty(fixture.browser, "localStorage", { get() { throw new Error("Storage blocked"); } });
    const store = createPlatformAppearanceStore(() => fixture.browser);
    const stop = store.subscribe(() => {});
    store.update({ theme: "dark", motion: "reduced" });
    expect(store.getSnapshot()).toMatchObject({ theme: "dark", motion: "reduced", storageAvailable: false });
    stop();
  });

  it("applies changes even when a storage write exceeds quota", () => {
    const fixture = browserFixture();
    fixture.storage.setItem = () => { throw new Error("Quota exceeded"); };
    const store = createPlatformAppearanceStore(() => fixture.browser);
    const stop = store.subscribe(() => {});
    store.update({ theme: "dark" });
    expect(store.getSnapshot()).toMatchObject({ theme: "dark", storageAvailable: false });
    stop();
  });

  it("syncs other tabs, ignores other keys and storage areas, and does not echo writes", () => {
    const fixture = browserFixture();
    const store = createPlatformAppearanceStore(() => fixture.browser);
    const stop = store.subscribe(() => {});
    fixture.storageEvent("pager:account", '{"theme":"dark"}');
    fixture.storageEvent("pager:display:v1", '{"theme":"dark"}', browserFixture().storage);
    expect(store.getSnapshot().theme).toBe("system");
    fixture.storageEvent("pager:display:v1", '{"theme":"dark","motion":"reduced"}');
    expect(store.getSnapshot()).toMatchObject({ theme: "dark", motion: "reduced" });
    expect(fixture.storage.getItem("pager:display:v1")).toBeNull();
    fixture.storageEvent("pager:display:v1", "{");
    expect(store.getSnapshot()).toMatchObject({ theme: "system", motion: "standard" });
    stop();
  });

  it.each(["pager:display:v1", null])("resets preferences when another tab removes settings (%s)", key => {
    const fixture = browserFixture('{"theme":"dark","motion":"reduced"}');
    const store = createPlatformAppearanceStore(() => fixture.browser);
    const stop = store.subscribe(() => {});
    fixture.storageEvent(key, null);
    expect(store.getSnapshot()).toMatchObject({ theme: "system", motion: "standard" });
    stop();
  });

  it("tracks system motion changes without replacing the stored user choice", () => {
    const fixture = browserFixture('{"theme":"light","motion":"standard"}');
    fixture.reduceMotion(true);
    const store = createPlatformAppearanceStore(() => fixture.browser);
    const stop = store.subscribe(() => {});
    expect(store.getSnapshot()).toMatchObject({ motion: "standard", systemReducedMotion: true });
    store.update({ motion: "standard" });
    expect(resolvePlatformMotion(store.getSnapshot().motion, store.getSnapshot().systemReducedMotion)).toBe("reduced");
    fixture.reduceMotion(false);
    expect(resolvePlatformMotion(store.getSnapshot().motion, store.getSnapshot().systemReducedMotion)).toBe("standard");
    store.update({ motion: "reduced" });
    fixture.reduceMotion(true);
    fixture.reduceMotion(false);
    expect(resolvePlatformMotion(store.getSnapshot().motion, store.getSnapshot().systemReducedMotion)).toBe("reduced");
    stop();
  });

  it("unsubscribes from browser events after the final controller disconnects", () => {
    const fixture = browserFixture();
    const store = createPlatformAppearanceStore(() => fixture.browser);
    const stopFirst = store.subscribe(() => {});
    const stopLast = store.subscribe(() => {});
    stopFirst();
    fixture.reduceMotion(true);
    expect(store.getSnapshot().systemReducedMotion).toBe(true);
    stopLast();
    const disconnected = store.getSnapshot();
    fixture.storageEvent("pager:display:v1", '{"theme":"dark"}');
    fixture.reduceMotion(false);
    expect(store.getSnapshot()).toBe(disconnected);
  });

  it("removes the platform theme on author routes while keeping motion control global", () => {
    const body = { dataset: { unrelated: "keep" } as DOMStringMap };
    const preferences = { theme: "dark", motion: "standard", systemReducedMotion: true } as const;
    applyPlatformAppearance(body, "/dashboard", preferences);
    expect(body.dataset).toEqual({ unrelated: "keep", platformTheme: "dark", platformMotion: "reduced" });
    applyPlatformAppearance(body, "/anna", preferences);
    expect(body.dataset).toEqual({ unrelated: "keep", platformMotion: "reduced" });
    applyPlatformAppearance(body, "/", { theme: "system", motion: "standard", systemReducedMotion: false });
    expect(body.dataset).toEqual({ unrelated: "keep", platformTheme: "system", platformMotion: "standard" });
  });

  it("renders a stable server fallback in either locale without accessing browser storage", async () => {
    const { PlatformPreferences } = await import("../src/app/ui/platform-preferences");
    vi.stubGlobal("window", { get localStorage() { throw new Error("SSR must not access localStorage"); } });
    expect(renderToStaticMarkup(createElement(PlatformPreferences, { locale: "ru" }))).toBe("");
    expect(renderToStaticMarkup(createElement(PlatformPreferences, { locale: "en" }))).toBe("");
  });
});
