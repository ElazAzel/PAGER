import { describe, expect, it, vi, afterEach } from "vitest";
import { assertDemoRequest, isDemoMode } from "../src/lib/server/demo";
import { signDemoSession, verifyDemoSession } from "../src/lib/server/demo-session";
import { assertSameOrigin } from "../src/lib/server/auth";

afterEach(() => vi.unstubAllEnvs());
describe("explicit local signed demo auth", () => {
  it("does not default into demo and rejects non-loopback hosts/proxies", () => {
    vi.stubEnv("PAGER_DEMO", "false"); expect(isDemoMode()).toBe(false);
    expect(() => assertDemoRequest(new Request("http://127.0.0.1/api/demo/session"))).toThrow();
    vi.stubEnv("PAGER_DEMO", "true");
    expect(() => assertDemoRequest(new Request("https://pager.example/api/demo/session"))).toThrow();
    expect(() => assertDemoRequest(new Request("http://127.0.0.1/api/demo/session", { headers: { "x-forwarded-for": "203.0.113.1" } }))).toThrow();
    expect(() => assertDemoRequest(new Request("http://127.0.0.1/api/demo/session", { headers: { "x-forwarded-for": "127.0.0.1" } }))).not.toThrow();
  });
  it("rejects absent, forged, expired and non-demo identities", () => {
    const secret = "s".repeat(64); const now = 1_000_000;
    const cookie = signDemoSession("buyer-primary", secret, now);
    expect(verifyDemoSession(cookie, secret, now)).toBe("buyer-primary");
    expect(verifyDemoSession(undefined, secret, now)).toBeNull();
    expect(verifyDemoSession(cookie + "x", secret, now)).toBeNull();
    expect(verifyDemoSession(cookie, "different".repeat(8), now)).toBeNull();
    expect(verifyDemoSession(cookie, secret, now + 9 * 3600_000)).toBeNull();
    expect(() => signDemoSession("arbitrary-id", secret, now)).toThrow();
  });
  it("blocks cross-origin and missing-origin mutations", () => {
    const url = "http://127.0.0.1:3000/api/page";
    expect(() => assertSameOrigin(new Request(url))).toThrow();
    expect(() => assertSameOrigin(new Request(url, { headers: { origin: "https://evil.test" } }))).toThrow();
    expect(() => assertSameOrigin(new Request(url, { headers: { origin: "http://127.0.0.1:3000" } }))).not.toThrow();
  });
});
