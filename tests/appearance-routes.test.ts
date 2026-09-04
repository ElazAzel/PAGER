import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page, PublicPage } from "../src/lib/types";
import { applyAppearancePreset } from "../src/lib/appearance";

const context = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "127.0.0.1:3100" }),
  cookies: async () => ({
    get: (name: string) => context.cookies.has(name) ? { value: context.cookies.get(name)! } : undefined,
    set: (name: string, value: string) => context.cookies.set(name, value),
    delete: (name: string) => context.cookies.delete(name),
    getAll: () => [...context.cookies].map(([name, value]) => ({ name, value })),
  }),
}));
import { POST as demoSession } from "../src/app/api/demo/session/route";
import { GET as dashboard } from "../src/app/api/dashboard/route";
import { PUT as save } from "../src/app/api/page/route";
import { POST as publish } from "../src/app/api/page/publish/route";
import { GET as publicPage } from "../src/app/api/public/[slug]/route";
import { GET as publicItem } from "../src/app/api/public/[slug]/items/[id]/route";
import { readState } from "../src/lib/server/store";

const origin = "http://127.0.0.1:3100";
const request = (url: string, method = "GET", body?: unknown) => new Request(origin + url, {
  method, headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const anna = () => ({ params: Promise.resolve({ slug: "anna" }) });
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "pager-appearance-routes-"));
  vi.stubEnv("PAGER_DEMO", "true"); vi.stubEnv("PAGER_DATA_DIR", directory); vi.stubEnv("PAGER_APP_URL", origin);
  vi.stubEnv("PAGER_PILOT_MODE", "false"); vi.stubEnv("PAGER_PAYMENTS_ENABLED", "true"); context.cookies.clear();
});
afterEach(async () => {
  context.cookies.clear(); vi.unstubAllEnvs();
  // Remove only the uniquely created disposable fixture, never a user directory.
  if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("pager-appearance-routes-")) throw new Error("Unexpected fixture directory");
  await rm(directory, { recursive: true, force: true });
});
async function login(identity: "primary" | "secondary" = "primary") {
  expect((await demoSession(request("/api/demo/session", "POST", { role: "creator", identity }))).status).toBe(200);
}
async function draft(): Promise<Page> { return (await (await dashboard(request("/api/dashboard"))).json()).page; }
async function published(): Promise<PublicPage> { return (await (await publicPage(request("/api/public/anna"), anna())).json()).page; }

describe("appearance through authenticated routes and durable storage", () => {
  it("persists a visual draft across fresh reads, then publishes it atomically with access gates", async () => {
    await login(); const original = await draft(); const changed = applyAppearancePreset(original, "midnight");
    changed.blocks[0].appearance = { entrance: "none", hover: "lift" };
    const saved = await save(request("/api/page", "PUT", { page: changed }));
    expect(saved.status).toBe(200);
    const result: Page = (await saved.json()).page;
    expect((await draft()).appearance?.theme).toBe("midnight");
    expect((await readState()).pages[0].blocks[0].appearance).toEqual({ entrance: "none", hover: "lift" });
    context.cookies.clear(); expect((await published()).appearance?.theme).toBe("paper");
    await login(); expect((await publish(request("/api/page/publish", "POST", { expectedRevision: result.revision }))).status).toBe(200);
    context.cookies.clear(); const anonymous = await published();
    expect(anonymous.appearance?.theme).toBe("midnight");
    expect(anonymous.blocks[0].appearance).toEqual({ entrance: "none", hover: "lift" });
    expect(anonymous.blocks.find(b => b.id === "anna-library")?.data).toBeUndefined();
    expect(JSON.stringify(anonymous)).not.toContain("anna-workbook-file");
    const detail = await publicItem(request("/api/public/anna/items/anna-workbook?blockId=anna-catalog"), { params: Promise.resolve({ slug: "anna", id: "anna-workbook" }) });
    expect(detail.status).toBe(200); expect(detail.headers.get("cache-control")).toContain("no-store");
    const item = await detail.json(); expect(item.page.appearance.theme).toBe("midnight"); expect(item.item.fileId).toBeUndefined();
  });

  it("rejects visitors and other creators, including appearance-only edits", async () => {
    const original = (await readState()).pages[0];
    const changed = applyAppearancePreset(original, "sage");
    expect((await save(request("/api/page", "PUT", { page: changed }))).status).toBe(401);
    await login("secondary");
    expect((await save(request("/api/page", "PUT", { page: changed }))).status).toBe(403);
    expect((await readState()).pages[0]).toEqual(original);
  });

  it("rejects unknown tokens and stale versions without overwriting the current appearance", async () => {
    await login(); const original = await draft();
    const changed = applyAppearancePreset(original, "sage");
    expect((await save(request("/api/page", "PUT", { page: { ...changed, appearance: { ...changed.appearance, css: "url(/private)" } } }))).status).toBe(400);
    expect((await draft()).revision).toBe(original.revision);
    expect((await save(request("/api/page", "PUT", { page: changed }))).status).toBe(200);
    expect((await save(request("/api/page", "PUT", { page: applyAppearancePreset(original, "rose") }))).status).toBe(409);
    expect((await draft()).appearance?.theme).toBe("sage");
    expect((await publish(request("/api/page/publish", "POST", { expectedRevision: original.revision }))).status).toBe(409);
    expect((await published()).appearance?.theme).toBe("paper");
  });
});
