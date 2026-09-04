import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, DatabaseState, Opportunity, User } from "../src/lib/types";
import type { CommerceOrder, PaymentFact } from "../src/lib/integrations/model";

const mocked = vi.hoisted(() => ({ currentUser: vi.fn(), readState: vi.fn() }));
vi.mock("../src/lib/server/auth", () => ({ currentUser: mocked.currentUser, assertSameOrigin: vi.fn() }));
vi.mock("../src/lib/server/store", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/server/store")>(), readState: mocked.readState }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not-found"); } }));

import { adminPeriod, isAdminUser, summarizeAdminState } from "../src/lib/server/admin";
import { GET } from "../src/app/api/admin/overview/route";
import AdminPage from "../src/app/admin/page";
import { emptyState, starterPage } from "../src/lib/server/seed";

const now = new Date("2026-09-03T12:00:00.000Z");
const at = now.toISOString();
const creator: User = { id: "creator-a", email: "PRIVATE_CREATOR_EMAIL@example.test", name: "PRIVATE_CREATOR_NAME", locale: "ru", role: "creator", createdAt: at };
const admin: User = { id: "admin-id", email: "PRIVATE_ADMIN_EMAIL@example.test", name: "PRIVATE_ADMIN_NAME", locale: "en", role: "buyer", createdAt: at };
const request = (query = "") => new Request(`http://127.0.0.1:3000/api/admin/overview${query}`);

function fixture(): DatabaseState {
  const state = emptyState(); state.users.push(creator, admin);
  const page = { ...starterPage(creator), id: "page-a", slug: "public-author", title: "Public author title", description: "PRIVATE_DESCRIPTION", publishedAt: at };
  page.blocks = [{ id: "paid-block", type: "text", paid: true, hidden: false, width: "full", teaser: "Public teaser", pricing: { currency: "USD", oneTime: 1000 }, data: { title: "PRIVATE_BLOCK_TITLE", text: "PRIVATE_BLOCK_BODY", fileId: "PRIVATE_FILE" } }];
  state.publishedPages.push(structuredClone(page));
  state.pages.push({ ...page, title: "PRIVATE_DRAFT_TITLE" });
  state.contacts.push({ id: "contact-a", ownerId: creator.id, email: "PRIVATE_CUSTOMER_EMAIL@example.test", name: "PRIVATE_CUSTOMER_NAME", notes: "PRIVATE_NOTES", createdAt: at, updatedAt: at });
  state.integrations.push({ id: "integration-a", ownerId: creator.id, stripeAccountId: "PRIVATE_STRIPE_ACCOUNT", stripeReady: true, calApiKeyEncrypted: "PRIVATE_CAL_SECRET", calRefreshTokenEncrypted: "PRIVATE_REFRESH_SECRET", calWebhookSecretEncrypted: "PRIVATE_WEBHOOK_SECRET", telegramChatId: "PRIVATE_CHAT", updatedAt: at });
  state.entitlements.push({ id: "PRIVATE_ENTITLEMENT", ownerId: creator.id, buyerId: "PRIVATE_BUYER", pageId: page.id, orderId: "PRIVATE_ORDER", scope: "page", status: "active", expiresAt: null, createdAt: at });
  return state;
}

function payment(id: string, amount: number, currency = "USD", extra: Partial<PaymentFact> = {}): PaymentFact { return { id, amount, currency, paid: true, paidAt: at, refundedAmount: 0, ...extra }; }
function order(id: string, payments: PaymentFact[], extra: Partial<CommerceOrder> = {}): CommerceOrder {
  return { id, ownerId: creator.id, pageId: "page-a", buyerId: "buyer-a", contactId: "contact-a", opportunityId: "opportunity-a", scope: "page", title: "PRIVATE_ORDER_TITLE", mode: "one_time", quantity: 1, amount: 1000, shippingAmount: 0, currency: "USD", status: "paid", fulfillment: "unfulfilled", stripeAccountId: "PRIVATE_STRIPE_ACCOUNT", expiresAt: at, createdAt: at, paidAt: at, test: false, commerce: { payments: Object.fromEntries(payments.map(value => [value.id, value])) }, ...extra };
}
function opportunity(id = "opportunity-a"): Opportunity { return { id, ownerId: creator.id, pageId: "page-a", contactId: "contact-a", source: "booking", status: "paid", message: "PRIVATE_MESSAGE", createdAt: at, convertedAt: at, test: false }; }

beforeEach(() => { vi.stubEnv("PAGER_DEMO", "false"); vi.stubEnv("PAGER_ADMIN_USER_IDS", "admin-id"); vi.stubEnv("PAGER_DEMO_ADMIN_USER_IDS", ""); mocked.currentUser.mockReset(); mocked.readState.mockReset(); mocked.readState.mockResolvedValue(fixture()); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("server-authorized platform administration", () => {
  it("rejects anonymous requests before reading the platform snapshot and never caches the denial", async () => {
    mocked.currentUser.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toContain("no-store"); expect(mocked.readState).not.toHaveBeenCalled();
    await expect(AdminPage()).rejects.toThrow("redirect:/login"); expect(mocked.readState).not.toHaveBeenCalled();
  });

  it("rejects unlisted buyers, creators and forged metadata/role claims before any aggregate read", async () => {
    for (const user of [{ ...admin, id: "buyer-id", isAdmin: true, user_metadata: { role: "admin" }, app_metadata: { role: "admin" } }, { ...creator, role: "admin" }]) {
      mocked.currentUser.mockResolvedValue(user);
      expect((await GET(request())).status).toBe(403);
      await expect(AdminPage()).rejects.toThrow("not-found");
    }
    expect(mocked.readState).not.toHaveBeenCalled();
  });

  it("uses exact immutable identity allowlists, never role, email or substrings", () => {
    vi.stubEnv("PAGER_ADMIN_USER_IDS", " other-id, admin-id , , ");
    expect(isAdminUser(admin)).toBe(true); expect(isAdminUser(creator)).toBe(false);
    expect(isAdminUser({ id: "admin" })).toBe(false); expect(isAdminUser(null)).toBe(false);
    vi.stubEnv("PAGER_ADMIN_USER_IDS", "*"); expect(isAdminUser(admin)).toBe(false);
    vi.stubEnv("PAGER_ADMIN_USER_IDS", ""); expect(isAdminUser(admin)).toBe(false);
  });

  it("isolates demo admin grants and rejects remote demo requests", async () => {
    mocked.currentUser.mockResolvedValue(admin);
    vi.stubEnv("PAGER_DEMO", "true");
    expect(isAdminUser(admin)).toBe(false); expect((await GET(request())).status).toBe(403);
    vi.stubEnv("PAGER_DEMO_ADMIN_USER_IDS", "admin-id"); expect(isAdminUser(admin)).toBe(true);
    expect((await GET(new Request("https://public.example/api/admin/overview"))).status).toBe(403);
    expect((await GET(new Request("http://127.0.0.1/api/admin/overview", { headers: { "x-forwarded-for": "203.0.113.2" } }))).status).toBe(403);
    vi.stubEnv("PAGER_DEMO", "false"); vi.stubEnv("PAGER_ADMIN_USER_IDS", ""); expect(isAdminUser(admin)).toBe(false);
    expect(mocked.readState).not.toHaveBeenCalled();
  });

  it("returns only the explicit operational DTO after authorization, including no private bodies or credentials", async () => {
    mocked.currentUser.mockResolvedValue(admin);
    vi.stubEnv("STRIPE_SECRET_KEY", "PRIVATE_ENV_STRIPE"); vi.stubEnv("DATABASE_URL", "PRIVATE_ENV_DATABASE");
    const response = await GET(request("?days=30")); const payload = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie"); expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(payload.locale).toBe("en"); expect(payload.period.days).toBe(30); expect(payload.totals).toEqual({ users: 2, creators: 1, buyers: 1, pages: 1, publishedPages: 1 });
    expect(payload.pages[0]).toMatchObject({ title: "Public author title", path: "/public-author", creatorId: creator.id });
    expect(JSON.stringify(payload)).not.toContain("PRIVATE_"); expect(payload).not.toHaveProperty("users"); expect(payload).not.toHaveProperty("entitlements");
    expect(mocked.readState).toHaveBeenCalledOnce();
  });

  it("bounds supported report windows and sanitizes unexpected storage errors", async () => {
    expect(adminPeriod(undefined)).toBe(7); expect(adminPeriod("30")).toBe(30);
    for (const value of ["-7", "90", "7.0", "all", "7&ownerId=other"]) expect(() => adminPeriod(value)).toThrow();
    mocked.currentUser.mockResolvedValue(admin);
    expect((await GET(request("?days=9999"))).status).toBe(400); expect(mocked.readState).not.toHaveBeenCalled();
    vi.spyOn(console, "error").mockImplementation(() => undefined); mocked.readState.mockRejectedValue(new Error("PRIVATE_DATABASE_PASSWORD"));
    const failed = await GET(request()); expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("PRIVATE_"); expect(failed.headers.get("cache-control")).toContain("no-store");
  });
});

describe("admin operational aggregation", () => {
  it("uses verified net payment ledgers, keeps currencies separate, counts booking and payment once and excludes simulated/self events", () => {
    const state = fixture();
    state.orders.push(order("usd", [payment("initial", 1000, "USD", { refundedAmount: 200 }), payment("renewal", 1000)]), order("eur", [payment("eur-payment", 1500, "EUR")], { currency: "EUR", opportunityId: "opportunity-b" }));
    state.orders.push(order("test", [payment("test-payment", 999999)], { test: true }), order("sandbox", [payment("sandbox-payment", 999999)], { commerce: { sandbox: true, payments: { sandbox: payment("sandbox", 999999) } } }), order("self", [payment("self-payment", 999999)], { buyerId: creator.id }), order("unverified", [], { amount: 999999 }), order("disputed", [payment("dispute", 999999, "USD", { dispute: "open" })]), order("refunded", [payment("refund", 999999, "USD", { refundedAmount: 999999 })]));
    state.opportunities.push(opportunity(), opportunity("opportunity-b"), opportunity("unsupported-opportunity"));
    const booking: Booking = { id: "booking-a", ownerId: creator.id, pageId: "page-a", contactId: "contact-a", opportunityId: "opportunity-a", buyerId: "buyer-a", providerId: "PRIVATE_PROVIDER_ID", title: "PRIVATE_BOOKING_TITLE", startAt: at, endAt: at, timezone: "UTC", status: "confirmed", version: 1, createdAt: at, test: false };
    state.bookings.push(booking);
    const view = { id: "view", ownerId: creator.id, pageId: "page-a", kind: "view" as const, visitorId: "visitor-a", createdAt: at, test: false };
    state.analytics.push(view, { ...view, id: "same-visitor" }, { ...view, id: "test", test: true }, { ...view, id: "owner", isOwner: true }, { ...view, id: "bot", isBot: true }, { ...view, id: "future", createdAt: "2026-09-04T00:00:00Z" });
    const report = summarizeAdminState(state, 7, false, "ru", now);
    expect(report.payments).toEqual({ paidOrders: 2, amountsByCurrency: { USD: 1800, EUR: 1500 } });
    expect(report.activity).toMatchObject({ views: 2, visitors: 1, activePages: 1, conversions: 2, northStar: 2 });
    expect(report.pages[0].conversions).toBe(2); expect(report.period.from).toBe("2026-08-28T00:00:00.000Z"); expect(JSON.stringify(report)).not.toContain("PRIVATE_");
    const demo = summarizeAdminState(state, 7, true, "ru", now);
    expect(demo.payments).toEqual({ paidOrders: 0, amountsByCurrency: {} }); expect(demo.activity.views).toBe(0); expect(demo.activity.conversions).toBe(0); expect(demo.integrations.every(provider => provider.mode === "demo" && !provider.configured)).toBe(true);
  });

  it("separates current notification backlog from period failures and ignores suppressed/test work", () => {
    const state = fixture();
    const notice = { id: "notice", ownerId: creator.id, recipient: "PRIVATE_EMAIL", kind: "booking", status: "pending" as const, scheduledAt: "2026-08-01T00:00:00Z", createdAt: "2026-08-01T00:00:00Z", test: false };
    state.notifications.push(notice, { ...notice, id: "future", scheduledAt: "2026-09-05T00:00:00Z" }, { ...notice, id: "failed", status: "failed", error: "PRIVATE_PROVIDER_ERROR" }, { ...notice, id: "test", test: true }, { ...notice, id: "suppressed", delivery: { suppressed: true } } as typeof notice);
    const report = summarizeAdminState(state, 7, false, "ru", now);
    expect(report.operations).toMatchObject({ failedNotifications: 1, pendingNotifications: 2, overdueNotifications: 1, notificationFailures: 0 }); expect(JSON.stringify(report)).not.toContain("PRIVATE_");
  });

  it("lists published metadata only, bounds the list, and constructs relative paths", () => {
    const state = fixture();
    for (let index = 0; index < 70; index++) state.publishedPages.push({ ...state.publishedPages[0], id: `extra-${index}`, slug: index === 0 ? "//evil.example" : `creator-${index}` });
    const report = summarizeAdminState(state, 7, false, "ru", now);
    expect(report.pageList).toEqual({ total: 71, limit: 50 }); expect(report.pages).toHaveLength(50);
    expect(report.pages.every(page => !page.path.startsWith("//"))).toBe(true); expect(JSON.stringify(report)).not.toContain("PRIVATE_");
  });
});
