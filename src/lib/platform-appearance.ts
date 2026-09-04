import type { Locale } from "./types";

export type PlatformTheme = "light" | "dark" | "system";
export type PlatformMotion = "standard" | "reduced";
export type PlatformAppearance = Readonly<{ theme: PlatformTheme; motion: PlatformMotion }>;
export type PlatformAppearanceSnapshot = PlatformAppearance & Readonly<{
  systemReducedMotion: boolean;
  storageAvailable: boolean;
  ready: boolean;
}>;

type StorageChange = Pick<StorageEvent, "key" | "newValue" | "storageArea">;
type MotionQuery = {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
};

export type PlatformAppearanceBrowser = {
  readonly localStorage: Storage;
  matchMedia(query: string): MotionQuery;
  addEventListener(type: "storage", listener: (event: StorageChange) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageChange) => void): void;
};

export const PLATFORM_APPEARANCE_KEY = "pager:display:v1";

/** Screen locale is not a preference and is never persisted. Only client
 * layout effects update it; server snapshots remain independent of visitors. */
export function createPlatformLocaleStore() {
  let locale: Locale = "ru";
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => locale,
    getServerSnapshot: (): Locale => "ru",
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; },
    set(next: Locale) { if (locale !== next) { locale = next; for (const notify of listeners) notify(); } },
  };
}
const defaults: PlatformAppearance = Object.freeze({ theme: "system", motion: "standard" });
const serverSnapshot: PlatformAppearanceSnapshot = Object.freeze({
  ...defaults, systemReducedMotion: false, storageAvailable: true, ready: false,
});

export function parsePlatformAppearance(value: string | null | undefined): PlatformAppearance {
  if (!value) return defaults;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
    const candidate = parsed as Record<string, unknown>;
    return {
      theme: candidate.theme === "light" || candidate.theme === "dark" || candidate.theme === "system" ? candidate.theme : defaults.theme,
      motion: candidate.motion === "standard" || candidate.motion === "reduced" ? candidate.motion : defaults.motion,
    };
  } catch {
    return defaults;
  }
}

export function resolvePlatformMotion(motion: PlatformMotion, systemReducedMotion: boolean): PlatformMotion {
  return systemReducedMotion || motion === "reduced" ? "reduced" : "standard";
}

export function isPlatformAppearanceRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const path = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  return ["/", "/dashboard", "/login", "/purchases", "/privacy", "/terms", "/checkout", "/admin"].includes(path)
    || path.startsWith("/checkout/") || path.startsWith("/admin/");
}

export function applyPlatformAppearance(
  body: { dataset: DOMStringMap },
  pathname: string | null,
  appearance: PlatformAppearance & { systemReducedMotion: boolean },
): void {
  if (isPlatformAppearanceRoute(pathname)) body.dataset.platformTheme = appearance.theme;
  else delete body.dataset.platformTheme;
  body.dataset.platformMotion = resolvePlatformMotion(appearance.motion, appearance.systemReducedMotion);
}

/** Browser access begins at subscription, never at module load or server render. */
export function createPlatformAppearanceStore(
  getBrowser: () => PlatformAppearanceBrowser | undefined = () => typeof window === "undefined" ? undefined : window,
) {
  let snapshot = serverSnapshot;
  const listeners = new Set<() => void>();
  let disconnect: (() => void) | undefined;

  function publish(next: PlatformAppearanceSnapshot) {
    if (next.theme === snapshot.theme && next.motion === snapshot.motion
      && next.systemReducedMotion === snapshot.systemReducedMotion
      && next.storageAvailable === snapshot.storageAvailable && next.ready === snapshot.ready) return;
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  }

  function connect() {
    const browser = getBrowser();
    if (!browser) return;
    let preferences: PlatformAppearance = snapshot;
    let storageAvailable = true;
    try {
      preferences = parsePlatformAppearance(browser.localStorage.getItem(PLATFORM_APPEARANCE_KEY));
    } catch {
      storageAvailable = false;
    }
    let media: MotionQuery | undefined;
    try {
      media = browser.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      // The CSS media query still protects motion if this browser API is absent.
    }
    const onMotion = () => publish({ ...snapshot, systemReducedMotion: media?.matches ?? false });
    const onStorage = (event: StorageChange) => {
      if (event.key !== PLATFORM_APPEARANCE_KEY && event.key !== null) return;
      try {
        if (event.storageArea && event.storageArea !== browser.localStorage) return;
      } catch {
        return;
      }
      // Storage events already describe a persisted change. Never write it back.
      publish({ ...snapshot, ...parsePlatformAppearance(event.key === null ? null : event.newValue), storageAvailable: true });
    };
    browser.addEventListener("storage", onStorage);
    media?.addEventListener("change", onMotion);
    disconnect = () => {
      browser.removeEventListener("storage", onStorage);
      media?.removeEventListener("change", onMotion);
    };
    publish({ ...preferences, systemReducedMotion: media?.matches ?? false, storageAvailable, ready: true });
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          disconnect?.();
          disconnect = undefined;
        }
      };
    },
    update(patch: Partial<PlatformAppearance>) {
      const preferences: PlatformAppearance = {
        theme: patch.theme ?? snapshot.theme,
        motion: patch.motion ?? snapshot.motion,
      };
      let storageAvailable = false;
      try {
        const storage = getBrowser()?.localStorage;
        if (storage) {
          storage.setItem(PLATFORM_APPEARANCE_KEY, JSON.stringify(preferences));
          storageAvailable = true;
        }
      } catch {
        // Keep this tab usable when storage is blocked or full.
      }
      publish({ ...snapshot, ...preferences, storageAvailable });
    },
  };
}
