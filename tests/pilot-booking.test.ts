import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileRepository } from "../src/lib/db/file-repository";
import { createDemoState } from "../src/lib/server/seed";
import { encryptSecret } from "../src/lib/integrations/security";
import { POST } from "../src/app/api/bookings/route";
import { requireUser } from "../src/lib/server/auth";

const mocks = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), dispatch: vi.fn() }));
vi.mock("../src/lib/server/store", () => ({ isDemoMode: () => process.env.PAGER_DEMO === "true", readState: mocks.read, mutateState: mocks.mutate }));
vi.mock("../src/lib/server/auth", async original => ({ ...await original<object>(), requireUser: vi.fn() }));
vi.mock("../src/lib/integrations/notifications", () => ({ dispatchNotifications: mocks.dispatch }));

let directory: string;
let repo: FileRepository;
let fixture: ReturnType<typeof setup>;
let network: ReturnType<typeof vi.fn>;
function setup() {
  const state = createDemoState();
  const buyer = state.users.find(user => user.role === "buyer")!;
  const other = state.users.filter(user => user.role === "buyer")[1];
  const page = state.publishedPages[0];
  const block = page.blocks.find(value => value.type === "booking")!;
  const item = state.items.find(value => value.ownerId === page.ownerId && value.kind === "service")!;
  page.paid = false; block.paid = false; block.hidden = false; block.archived = false;
  block.data.eventTypeId = 8181; block.data.itemIds = [item.id]; item.eventTypeId = 8181; item.price = 12500;
  state.pages = [structuredClone(page)]; state.bookings = []; state.orders = []; state.notifications = []; state.webhooks = [];
  state.integrations = [{ id: "cal-integration", ownerId: page.ownerId, calApiKeyEncrypted: encryptSecret("cal_test_creator_key", `${page.ownerId}:cal-api`), calWebhookSecretEncrypted: encryptSecret("cal-webhook-secret", `${page.ownerId}:cal-webhook`), updatedAt: new Date().toISOString() }];
  const startAt = new Date(Date.now() + 48 * 3600_000).toISOString();
  const endAt = new Date(Date.parse(startAt) + 60 * 60_000).toISOString();
  const canonical = { status: "success", data: { uid: "provider-booking-1", eventTypeId: 8181, title: "Consultation", start: startAt, end: endAt, status: "accepted", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attendees: [{ email: buyer.email, name: buyer.name, timeZone: "Asia/Almaty" }] } };
  return { state, buyer, other, page, block, item, startAt, endAt, canonical };
}
const input = () => ({ pageId: fixture.page.id, blockId: fixture.block.id, itemId: fixture.item.id, name: fixture.buyer.name, email: fixture.buyer.email, startAt: fixture.startAt, timezone: "Asia/Almaty", idempotencyKey: "45ea3350-aadb-442c-bec0-bd79f742ba0b" });
function book(changes: Record<string, unknown> = {}) {
  return POST(new Request("https://pager.example/api/bookings", { method: "POST", headers: { Origin: "https://pager.example", "Content-Type": "application/json" }, body: JSON.stringify({ ...input(), ...changes }) }));
}
beforeEach(async () => {
  vi.stubEnv("PAGER_DEMO", "false"); vi.stubEnv("PAGER_PAYMENTS_ENABLED", "false"); vi.stubEnv("PAGER_APP_URL", "https://pager.example");
  vi.stubEnv("PAGER_INTEGRATION_KEY", Buffer.alloc(32, 5).toString("base64"));
  fixture = setup(); directory = await mkdtemp(path.join(os.tmpdir(), "pager-pilot-booking-")); repo = new FileRepository(directory, () => structuredClone(fixture.state));
  mocks.read.mockImplementation(() => repo.read()); mocks.mutate.mockImplementation((fn: Parameters<FileRepository["mutate"]>[0]) => repo.mutate(fn));
  mocks.dispatch.mockResolvedValue({ queued: 2, ready: false }); vi.mocked(requireUser).mockResolvedValue(fixture.buyer);
  network = vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/v2/slots") return Response.json({ status: "success", data: { [fixture.startAt.slice(0, 10)]: [{ start: fixture.startAt, end: fixture.endAt, bookingUid: "must-not-leak", attendeesCount: 2 }] } });
    if (parsed.pathname === "/v2/bookings" && init?.method === "POST") return Response.json(fixture.canonical, { status: 201 });
    if (parsed.pathname === "/v2/bookings/provider-booking-1") return Response.json(fixture.canonical);
    throw new Error(`Unexpected provider request: ${parsed.pathname}`);
  });
  vi.stubGlobal("fetch", network);
});
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); await rm(directory, { recursive: true, force: true }); });

describe("pilot booking provider boundary", () => {
  it("confirms the verified provider result with CRM and notices, without creating a payment order", async () => {
    const result = await book(); expect(result.status).toBe(200);
    const payload = await result.json(); const state = await repo.read();
    expect(payload.booking).toMatchObject({ providerId: "provider-booking-1", buyerId: fixture.buyer.id, startAt: fixture.startAt, endAt: fixture.endAt, timezone: "Asia/Almaty", status: "confirmed", test: false });
    expect(payload.booking.commerce).toBeUndefined(); expect(payload.orderId).toBeUndefined(); expect(payload.demo).toBe(false);
    expect(state.orders).toHaveLength(0); expect(state.bookings).toHaveLength(1); expect(state.notifications).toHaveLength(2);
    expect(state.opportunities.find(value => value.id === payload.booking.opportunityId)?.status).toBe("booked");
    const request = network.mock.calls.find(([url, init]) => new URL(url).pathname === "/v2/bookings" && init?.method === "POST")!;
    const sent = JSON.parse(request[1]!.body as string);
    expect(sent.attendee.email).toBe(fixture.buyer.email); expect(sent.eventTypeId).toBe(8181);
    expect(sent.allowConflicts).not.toBe(true); expect(sent.allowBookingOutOfBounds).not.toBe(true);
  });
});
