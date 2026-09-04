import { describe, expect, it, vi } from "vitest";
import { createPlatformLocaleStore } from "../src/lib/platform-appearance";

describe("platform appearance follows the active screen language", () => {
  it("notifies the dialog when a screen changes locale, with stable Russian SSR", () => {
    const store = createPlatformLocaleStore(); const notify = vi.fn();
    const stop = store.subscribe(notify);
    expect(store.getSnapshot()).toBe("ru");
    store.set("en");
    expect(store.getSnapshot()).toBe("en"); expect(notify).toHaveBeenCalledTimes(1);
    expect(store.getServerSnapshot()).toBe("ru");
    store.set("en"); expect(notify).toHaveBeenCalledTimes(1);
    store.set("ru"); expect(store.getSnapshot()).toBe("ru");
    stop(); store.set("en"); expect(notify).toHaveBeenCalledTimes(2);
  });
});
