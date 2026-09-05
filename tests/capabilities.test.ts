import { afterEach, describe, expect, it, vi } from "vitest";
import { getCapabilities } from "../src/lib/server/capabilities";

afterEach(() => vi.unstubAllEnvs());

describe("server-owned capabilities", () => {
  it("keeps local demo commerce available without enabling a real provider", () => {
    vi.stubEnv("PAGER_DEMO", "true");
    vi.stubEnv("PAGER_PILOT_MODE", "false");
    vi.stubEnv("PAGER_PAYMENTS_ENABLED", "false");
    expect(getCapabilities()).toMatchObject({ demo: true, payments: true });
  });

  it("requires an explicit true flag for real payments", () => {
    vi.stubEnv("PAGER_DEMO", "false");
    vi.stubEnv("PAGER_PILOT_MODE", "false");
    vi.stubEnv("PAGER_PAYMENTS_ENABLED", "");
    expect(getCapabilities().payments).toBe(false);
    vi.stubEnv("PAGER_PAYMENTS_ENABLED", "true");
    expect(getCapabilities().payments).toBe(true);
  });

  it("never enables payments or open creator signup in pilot mode", () => {
    vi.stubEnv("PAGER_DEMO", "false");
    vi.stubEnv("PAGER_PILOT_MODE", "true");
    vi.stubEnv("PAGER_PAYMENTS_ENABLED", "true");
    expect(getCapabilities()).toMatchObject({ pilot: true, payments: false, creatorSignup: false });
  });
});
