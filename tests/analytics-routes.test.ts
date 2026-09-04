import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "127.0.0.1:3100" }), cookies: async () => ({ get: (name: string) => context.values.has(name) ? { value: context.values.get(name)! } : undefined, set: (name: string, value: string) => context.values.set(name, value), delete: (name: string) => context.values.delete(name), getAll: () => [...context.values.entries()].map(([name, value]) => ({ name, value })) }) }));
import { POST as demoSession } from "../src/app/api/demo/session/route";
import { POST } from "../src/app/api/analytics/route";
import { GET } from "../src/app/api/analytics/report/route";
import { mutateState, readState } from "../src/lib/server/store";
import { recordAnalytics } from "../src/lib/server/metrics";

const origin = "http://127.0.0.1:3100";
const request = (url: string, value?: unknown, extra: Record<string, string> = {}) => new Request(origin + url, { method: value ? "POST" : "GET", headers: { origin, ...(value ? { "content-type": "application/json" } : {}), ...extra }, ...(value ? { body: JSON.stringify(value) } : {}) });
let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "pager-analytics-")); vi.stubEnv("PAGER_DEMO", "true"); vi.stubEnv("PAGER_DATA_DIR", dir); vi.stubEnv("PAGER_APP_URL", origin); context.values.clear(); });
afterEach(async () => { context.values.clear(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
async function login(role: "creator" | "buyer", identity: "primary" | "secondary" = "primary") { expect((await demoSession(request("/api/demo/session", { role, identity }))).status).toBe(200); }

describe("analytics HTTP authentication and untrusted event contract", () => {
  it("requires a creator session, rejects caller-selected tenants and never returns another creator's aggregates", async () => {
    expect((await GET(request("/api/analytics/report"))).status).toBe(401);
    await login("buyer"); expect((await GET(request("/api/analytics/report"))).status).toBe(403);
    await mutateState(state => {
      recordAnalytics(state, { pageId: "page-anna", kind: "view", visitorId: "anna-visitor" }, undefined, false);
      recordAnalytics(state, { pageId: "page-other", kind: "view", visitorId: "other-visitor-a" }, undefined, false);
      recordAnalytics(state, { pageId: "page-other", kind: "view", visitorId: "other-visitor-b" }, undefined, false);
    });
    await login("creator");
    expect((await GET(request("/api/analytics/report?ownerId=creator-other"))).status).toBe(400);
    expect((await GET(request("/api/analytics/report?days=365"))).status).toBe(400);
    const response = await GET(request("/api/analytics/report?days=7"));
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    const { report } = await response.json(); expect(report.demo).toBe(true); expect(report.summary.views).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/other-visitor|other-profile|email|stripeAccount|visitorId/);
    await login("creator", "secondary"); expect((await (await GET(request("/api/analytics/report?days=90"))).json()).report.summary.views).toBe(2);
  });
  it("does not accept financial events, raw URLs, owner identities, supplied timestamps or test flags", async () => {
    const valid = { pageId: "page-anna", kind: "view", visitorId: "visitor-123" };
    for (const value of [{ ...valid, kind: "payment_failed" }, { ...valid, kind: "paid" }, { ...valid, amount: 100000 }, { ...valid, test: false }, { ...valid, ownerId: "creator-other" }, { ...valid, createdAt: "2026-01-01" }, { ...valid, source: "https://example.com/private?email=secret" }, { ...valid, referrer: "https://example.com/private" }]) expect((await POST(request("/api/analytics", value))).status).toBe(400);
    expect((await POST(request("/api/analytics", { ...valid, source: "ai", device: "mobile", eventId: "event-123" }))).status).toBe(200);
    const state = await readState(); expect(state.analytics).toHaveLength(1); expect(state.analytics[0]).toMatchObject({ test: true, source: "ai", device: "mobile" });
    expect(state.orders).toHaveLength(0); expect(state.opportunities).toHaveLength(0);
  });
  it("excludes owner sessions, bots and privacy opt-outs, and enforces same origin and block access", async () => {
    const valid = { pageId: "page-anna", kind: "view", visitorId: "visitor-123" };
    const excludedHeaders: Record<string, string>[] = [{ "user-agent": "GPTBot/1.2" }, { dnt: "1" }, { "sec-gpc": "1" }];
    for (const headers of excludedHeaders) expect((await POST(request("/api/analytics", valid, headers))).status).toBe(200);
    expect((await POST(request("/api/analytics", valid, { origin: "https://attacker.example" }))).status).toBe(403);
    expect((await POST(request("/api/analytics", { ...valid, kind: "click", blockId: "anna-library" }))).status).toBe(403);
    await login("creator"); expect((await POST(request("/api/analytics", valid))).status).toBe(200);
    expect((await readState()).analytics).toHaveLength(0);
  });
  it("accepts explicit access CTA signals while rejecting invented actions and normal clicks on protected content", async () => {
    const input = { pageId: "page-anna", kind: "click", visitorId: "visitor-paywall-123" };
    expect((await POST(request("/api/analytics", { ...input, blockId: "anna-library" }))).status).toBe(403);
    expect((await POST(request("/api/analytics", { ...input, action: "block_access", blockId: "anna-library" }))).status).toBe(200);
    expect((await POST(request("/api/analytics", { ...input, action: "buy_anything", blockId: "anna-library" }))).status).toBe(400);
    expect((await POST(request("/api/analytics", { ...input, kind: "view", action: "block_access", blockId: "anna-library" }))).status).toBe(400);
    await mutateState(state => { state.publishedPages[0].paid = true; });
    expect((await POST(request("/api/analytics", { ...input, action: "page_access" }))).status).toBe(200);
    expect((await POST(request("/api/analytics", { ...input, action: "block_access", blockId: "anna-library" }))).status).toBe(403);
    expect((await POST(request("/api/analytics", { ...input, action: "page_access", blockId: "anna-library" }))).status).toBe(403);
    const state = await readState(); expect(state.analytics).toHaveLength(2); expect(state.entitlements).toHaveLength(0); expect(state.orders).toHaveLength(0);
  });
});
