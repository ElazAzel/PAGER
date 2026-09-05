import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileRepository } from "../src/lib/db/file-repository";
import { createDemoState } from "../src/lib/server/seed";
import { encryptSecret } from "../src/lib/integrations/security";
import { claimBuyerBookings } from "../src/lib/integrations/booking-claims";
import { POST as calWebhook } from "../src/app/api/webhooks/cal/[ownerId]/route";
import { GET as purchases } from "../src/app/api/purchases/route";
import { requireUser } from "../src/lib/server/auth";

const mocks = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), cal: vi.fn(), dispatch: vi.fn() }));
vi.mock("../src/lib/server/store", () => ({ isDemoMode: () => process.env.PAGER_DEMO === "true", readState: mocks.read, mutateState: mocks.mutate }));
vi.mock("../src/lib/server/auth", async importOriginal => ({ ...await importOriginal<object>(), requireUser: vi.fn() }));
vi.mock("../src/lib/integrations/cal", () => ({ calRequest: mocks.cal }));
vi.mock("../src/lib/integrations/notifications", () => ({ dispatchNotifications: mocks.dispatch }));

let repo: FileRepository; let dir: string; let fixture: ReturnType<typeof setup>;
function setup() {
  const state = createDemoState(); const buyer = state.users.find(u => u.role === "buyer")!; const other = state.users.filter(u => u.role === "buyer")[1];
  const page = state.publishedPages[0]; const block = page.blocks.find(b => b.type === "booking")!; const item = state.items.find(i => i.pageId === page.id && i.kind === "service")!;
  page.paid = false; block.paid = false; block.hidden = false; block.archived = false; block.data.eventTypeId = 8181; block.data.itemIds = [item.id]; item.eventTypeId = 8181; item.price = 12500; item.currency = "usd";
  state.bookings = []; state.orders = []; state.notifications = []; state.webhooks = [];
  state.integrations = [{ id: "cal-integration", ownerId: page.ownerId, calWebhookSecretEncrypted: encryptSecret("test-cal-webhook-secret", `${page.ownerId}:cal-webhook`), updatedAt: new Date().toISOString() }];
  const start = new Date(Date.now() + 48 * 3600_000).toISOString(); const end = new Date(Date.now() + 49 * 3600_000).toISOString();
  const raw = JSON.stringify({ triggerEvent: "BOOKING_CREATED", createdAt: new Date().toISOString(), payload: { uid: "cal-confirmed", eventTypeId: 8181, title: "Consultation", startTime: start, endTime: end, attendees: [{ email: buyer.email.toUpperCase(), name: buyer.name, timeZone: "Asia/Almaty" }], metadata: { buyerId: other.id, ownerId: "forged-owner" } } });
  const canonical = { data: { uid: "cal-confirmed", eventTypeId: 8181, title: "Consultation", start, end, status: "accepted", attendees: [{ email: buyer.email, name: buyer.name, timeZone: "Asia/Almaty" }] } };
  return { state, buyer, other, page, item, raw, canonical };
}
async function webhook(signature = createHmac("sha256", "test-cal-webhook-secret").update(fixture.raw).digest("hex")) {
  return calWebhook(new Request(`https://pager.example/api/webhooks/cal/${fixture.page.ownerId}`, { method: "POST", headers: { "x-cal-signature-256": signature }, body: fixture.raw }), { params: Promise.resolve({ ownerId: fixture.page.ownerId }) });
}
beforeEach(async () => {
  vi.stubEnv("PAGER_PILOT_MODE", "false"); vi.stubEnv("PAGER_PAYMENTS_ENABLED", "true");
  vi.stubEnv("PAGER_DEMO", "false"); vi.stubEnv("PAGER_STRIPE_LIVE", "true"); vi.stubEnv("PAGER_INTEGRATION_KEY", Buffer.alloc(32, 4).toString("base64"));
  fixture = setup(); dir = await mkdtemp(path.join(os.tmpdir(), "pager-cal-claims-")); repo = new FileRepository(dir, () => structuredClone(fixture.state));
  mocks.read.mockImplementation(() => repo.read()); mocks.mutate.mockImplementation((fn: Parameters<FileRepository["mutate"]>[0]) => repo.mutate(fn));
  mocks.cal.mockResolvedValue(fixture.canonical); mocks.dispatch.mockResolvedValue({ queued: 0, ready: false }); vi.mocked(requireUser).mockResolvedValue(fixture.buyer);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No live provider calls permitted")));
});
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); await rm(dir, { recursive: true, force: true }); });

describe("signed Cal booking and verified-email claim transactions", () => {
  it("rejects an unsigned webhook before canonical read or booking mutations", async () => {
    expect((await webhook("invalid")).status).toBe(401); expect((await repo.read()).bookings).toHaveLength(0); expect(mocks.cal).not.toHaveBeenCalled();
  });
  it("commits the known-email booking even when the subsequent paid-order transaction fails", async () => {
    const result = await webhook(); expect(result.status).toBe(200); const body = await result.json();
    let state = await repo.read(); const booking = state.bookings[0];
    expect(booking.buyerId).toBe(fixture.buyer.id); expect(booking.ownerId).toBe(fixture.page.ownerId); expect(booking.status).toBe("confirmed"); expect(booking.test).toBe(false);
    expect(body.orderId).toBeUndefined(); expect(state.orders).toHaveLength(0); expect(state.notifications).toHaveLength(2); expect(state.analytics.filter(a => a.id === `booking-order:${booking.id}`)).toHaveLength(1);
    expect(mocks.dispatch).toHaveBeenCalledWith(booking.id);
    expect((await webhook()).status).toBe(200); expect((await repo.read()).bookings).toHaveLength(1);
    await claimBuyerBookings(fixture.buyer); expect((await repo.read()).bookings[0].status).toBe("confirmed");
    await repo.mutate(s => { s.integrations[0].stripeAccountId = "acct_test_only"; s.integrations[0].stripeReady = true; });
    await claimBuyerBookings(fixture.buyer); await claimBuyerBookings(fixture.buyer); state = await repo.read();
    expect(state.orders).toHaveLength(1); expect(state.orders[0].status).toBe("pending"); expect(state.orders[0].bookingId).toBe(booking.id); expect(state.orders[0].opportunityId).toBe(booking.opportunityId); expect(state.orders[0].amount).toBe(fixture.item.price);
    expect(state.bookings[0].status).toBe("confirmed"); expect(fetch).not.toHaveBeenCalled();
  });
  it("the authenticated purchases hook claims pre-registration bookings and leaves payment failures visible", async () => {
    fixture.state.users = fixture.state.users.filter(u => u.id !== fixture.buyer.id);
    expect((await webhook()).status).toBe(200); expect((await repo.read()).bookings[0].buyerId).toBeUndefined();
    vi.mocked(requireUser).mockResolvedValue(fixture.other);
    const unrelated = await purchases(new Request("https://pager.example/api/purchases")); expect((await unrelated.json()).bookings).toHaveLength(0);
    await repo.mutate(state => { state.users.push(fixture.buyer); }); vi.mocked(requireUser).mockResolvedValue({ ...fixture.buyer, email: ` ${fixture.buyer.email.toUpperCase()} ` });
    const result = await purchases(new Request("https://pager.example/api/purchases")); expect(result.status).toBe(200); const library = await result.json();
    expect(library.bookings).toHaveLength(1); expect(library.bookings[0].buyerId).toBe(fixture.buyer.id); expect(library.bookings[0].commerce).toBeUndefined(); expect(library.orders).toHaveLength(0);
    const state = await repo.read(); expect(state.bookings[0].status).toBe("confirmed"); expect(state.analytics.some(a => a.id === `booking-order:${state.bookings[0].id}`)).toBe(true);
    vi.mocked(requireUser).mockResolvedValue(fixture.other); expect((await (await purchases(new Request("https://pager.example/api/purchases"))).json()).bookings).toHaveLength(0);
  });
  it("does not reassign an existing buyer even when another verified session has the same email", async () => {
    await webhook(); await claimBuyerBookings({ ...fixture.other, email: fixture.buyer.email });
    expect((await repo.read()).bookings[0].buyerId).toBe(fixture.buyer.id);
  });
  it("does not create a second order for a confirmed already-paid booking", async () => {
    fixture.state.integrations[0].stripeAccountId = "acct_test_only"; fixture.state.integrations[0].stripeReady = true;
    await webhook(); await repo.mutate(state => { state.orders[0].status = "paid"; }); await claimBuyerBookings(fixture.buyer);
    expect((await repo.read()).orders).toHaveLength(1);
  });
});
