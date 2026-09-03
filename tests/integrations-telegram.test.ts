import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseState } from "../src/lib/types";
import { FileRepository } from "../src/lib/db/file-repository";
import { createDemoState } from "../src/lib/server/seed";
import { applyTelegramUpdate, createTelegramPair, disconnectTelegram, telegramStatus } from "../src/lib/integrations/telegram";
import { decryptSecret } from "../src/lib/integrations/security";
import type { CommerceIntegration } from "../src/lib/integrations/model";
import { queueBookingNotices, type Notice } from "../src/lib/integrations/notification-queue";
import { deliverNotification, notificationsReady } from "../src/lib/integrations/notifications";
import { GET, POST, DELETE } from "../src/app/api/integrations/telegram/route";
import { POST as webhook } from "../src/app/api/webhooks/telegram/route";
import { requireUser } from "../src/lib/server/auth";

const store = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), email: vi.fn() }));
vi.mock("../src/lib/server/store", () => ({ isDemoMode: () => process.env.PAGER_DEMO === "true", readState: store.read, mutateState: store.mutate }));
vi.mock("../src/lib/server/auth", async importOriginal => ({ ...await importOriginal<object>(), requireUser: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: store.email }; } }));

let dir: string; let repo: FileRepository; let fixture: ReturnType<typeof setup>;
const now = () => Date.now();
function setup() {
  const state = createDemoState(); const buyer = state.users.find(u => u.role === "buyer")!;
  const other = state.users.filter(u => u.role === "buyer")[1]; const page = state.publishedPages[0];
  const contact = state.contacts.find(c => c.ownerId === page.ownerId && c.email === buyer.email)!;
  state.bookings = [{ id: "telegram-booking", buyerId: buyer.id, ownerId: page.ownerId, pageId: page.id, contactId: contact.id, opportunityId: "opp", title: "Private consultation", startAt: new Date(now() + 48 * 3600_000).toISOString(), endAt: new Date(now() + 49 * 3600_000).toISOString(), timezone: "Asia/Almaty", status: "confirmed", version: 1, createdAt: new Date().toISOString(), test: false }];
  state.notifications = []; state.integrations = [];
  return { state, buyer, other, page };
}
function token(url: string) { return new URL(url).searchParams.get("start")!; }
function update(pair: string, id = 123456) { return { update_id: 1, message: { text: `/start ${pair}`, chat: { id, type: "private" }, from: { id, is_bot: false } } }; }
function connection(state: DatabaseState, id = fixture.buyer.id) { return (state.integrations.find(i => i.ownerId === id) as CommerceIntegration)?.commerce?.telegram; }
async function pairAndQueue() {
  await repo.mutate(state => { const pair = createTelegramPair(state, fixture.buyer); applyTelegramUpdate(state, update(token(pair.url))); queueBookingNotices(state, state.bookings[0]); });
  return (await repo.read()).notifications[0].id;
}
async function notice(id: string) { return (await repo.read()).notifications.find(n => n.id === id) as Notice; }
const request = (method = "POST", value: unknown = {}, headers: Record<string, string> = {}) => new Request("https://pager.example/api/integrations/telegram", { method, headers: { origin: "https://pager.example", "content-type": "application/json", ...headers }, ...(method === "POST" ? { body: JSON.stringify(value) } : {}) });

beforeEach(async () => {
  vi.stubEnv("PAGER_DEMO", "false"); vi.stubEnv("PAGER_APP_URL", "https://pager.example");
  vi.stubEnv("PAGER_TELEGRAM_ENABLED", "true"); vi.stubEnv("TELEGRAM_BOT_TOKEN", "424242:local_test_token"); vi.stubEnv("TELEGRAM_BOT_USERNAME", "pager_test_bot"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s".repeat(32));
  vi.stubEnv("PAGER_INTEGRATION_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("PAGER_NOTIFICATIONS_ENABLED", "true"); vi.stubEnv("INNGEST_EVENT_KEY", "local-test"); vi.stubEnv("INNGEST_SIGNING_KEY", "local-test"); vi.stubEnv("RESEND_API_KEY", "local-test"); vi.stubEnv("RESEND_FROM", "test@pager.example");
  fixture = setup(); dir = await mkdtemp(path.join(os.tmpdir(), "pager-telegram-")); repo = new FileRepository(dir, () => structuredClone(fixture.state));
  store.read.mockImplementation(() => repo.read()); store.mutate.mockImplementation((fn: Parameters<FileRepository["mutate"]>[0]) => repo.mutate(fn));
  vi.mocked(requireUser).mockResolvedValue(fixture.buyer);
  store.email.mockResolvedValue({ data: { id: "resend-test-id" }, error: null });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ ok: true, result: { message_id: 1, chat: { id: 123456, type: "private" } } })));
});
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); await rm(dir, { recursive: true, force: true }); });

describe("recipient Telegram opt-in boundary", () => {
  it("issues an opaque recipient-bound link and consumes it exactly once under concurrent updates", async () => {
    const pair = await repo.mutate(state => createTelegramPair(state, fixture.buyer));
    expect(token(pair.url)).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(Date.parse(pair.expiresAt) - now()).toBeLessThanOrEqual(600_000);
    expect(JSON.stringify(await repo.read())).not.toContain(token(pair.url));
    const second = new FileRepository(dir, () => structuredClone(fixture.state));
    const results = await Promise.all([repo.mutate(state => applyTelegramUpdate(state, update(token(pair.url)))), second.mutate(state => applyTelegramUpdate(state, update(token(pair.url), 654321)))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const saved = await repo.read(); const link = connection(saved)!;
    expect(link.recipientId).toBe(fixture.buyer.id); expect(connection(saved, fixture.other.id)).toBeUndefined();
    expect(decryptSecret(link.chatIdEncrypted, `${fixture.buyer.id}:telegram:${link.id}`)).toMatch(/^(123456|654321)$/);
    expect((saved.integrations[0] as CommerceIntegration).commerce?.telegramPair).toBeUndefined();
    expect(await repo.mutate(state => applyTelegramUpdate(state, update(token(pair.url))))).toBe(false);
  });
  it("rejects expired, replaced and email-changed pair tokens", () => {
    const { state, buyer } = fixture;
    const expired = createTelegramPair(state, buyer, now() - 600_000); expect(applyTelegramUpdate(state, update(token(expired.url)))).toBe(false);
    const first = createTelegramPair(state, buyer); const next = createTelegramPair(state, buyer);
    expect(applyTelegramUpdate(state, update(token(first.url)))).toBe(false);
    buyer.email = "new@example.com"; expect(applyTelegramUpdate(state, update(token(next.url)))).toBe(false);
    expect(connection(state)).toBeUndefined();
  });
  it("ignores group, bot, forged sender, edited and wrong-bot commands", () => {
    const { state, buyer } = fixture; const pair = token(createTelegramPair(state, buyer).url); const valid = update(pair);
    for (const message of [ { ...valid.message, chat: { id: -42, type: "group" } }, { ...valid.message, from: { id: 123456, is_bot: true } }, { ...valid.message, from: { id: 77, is_bot: false } }, { ...valid.message, text: `/start@other_bot ${pair}` } ]) expect(applyTelegramUpdate(state, { update_id: 1, message })).toBe(false);
    expect(applyTelegramUpdate(state, { update_id: 1, edited_message: valid.message })).toBe(false);
    expect(applyTelegramUpdate(state, valid)).toBe(true);
  });
  it("requires a server session and same origin; never accepts caller recipient or chatId", async () => {
    const { ApiError } = await import("../src/lib/server/http");
    vi.mocked(requireUser).mockRejectedValueOnce(new ApiError(401, "Sign in required")); expect((await POST(request())).status).toBe(401);
    expect((await POST(request("POST", {}, { origin: "https://evil.example" }))).status).toBe(403);
    for (const body of [{ chatId: "123456" }, { email: fixture.other.email }, { userId: fixture.other.id }]) expect((await POST(request("POST", body))).status).toBe(400);
    expect((await repo.read()).integrations).toHaveLength(0);
  });
  it("authenticates webhook before mutation and exposes only own status", async () => {
    const paired = await POST(request()); const payload = await paired.json(); expect(paired.headers.get("cache-control")).toContain("no-store");
    expect((await webhook(request("POST", update(token(payload.url))))).status).toBe(401);
    expect((await webhook(request("POST", update(token(payload.url)), { "x-telegram-bot-api-secret-token": "wrong" }))).status).toBe(401);
    expect(connection(await repo.read())).toBeUndefined();
    const result = await webhook(request("POST", update(token(payload.url)), { "x-telegram-bot-api-secret-token": "s".repeat(32) }));
    expect(await result.json()).toEqual({ received: true });
    expect(await (await GET(request("GET"))).json()).toEqual({ configured: true, connected: true });
    vi.mocked(requireUser).mockResolvedValue(fixture.other); expect(await (await GET(request("GET"))).json()).toEqual({ configured: true, connected: false });
    await DELETE(request("DELETE")); expect(connection(await repo.read())).toBeDefined();
    vi.mocked(requireUser).mockResolvedValue(fixture.buyer); await DELETE(request("DELETE")); expect(connection(await repo.read())).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("demo never pairs or sends and legacy creator chat IDs are ignored", async () => {
    vi.stubEnv("PAGER_DEMO", "true"); expect(() => createTelegramPair(fixture.state, fixture.buyer)).toThrow();
    expect(telegramStatus(fixture.state, fixture.buyer)).toEqual({ configured: false, connected: false });
    await expect(deliverNotification("anything")).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("PAGER_DEMO", "false"); fixture.state.integrations.push({ id: "legacy", ownerId: fixture.page.ownerId, telegramChatId: "123456", updatedAt: new Date().toISOString() });
    queueBookingNotices(fixture.state, fixture.state.bookings[0]); expect((fixture.state.notifications[0] as Notice).delivery?.telegram).toBeUndefined();
  });
});

describe("independent Telegram notification results", () => {
  it.each(["booking_confirmation", "booking_reminder", "booking_cancelled"])("delivers %s once alongside Resend, using the opted-in private chat", async kind => {
    const id = await pairAndQueue();
    await repo.mutate(state => { const n = state.notifications.find(n => n.id === id)!; n.kind = `${kind}:v1`; if (kind === "booking_cancelled") state.bookings[0].status = "cancelled"; });
    await deliverNotification(id); await deliverNotification(id);
    expect(store.email).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
    expect((await notice(id)).status).toBe("sent"); expect((await notice(id)).delivery?.telegram?.status).toBe("sent");
    const data = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string); expect(data.chat_id).toBe("123456"); expect(data.text).toContain("Asia/Almaty"); expect(data.parse_mode).toBeUndefined();
  });
  it.each(["ru", "en"])("renders %s recipient messages", async locale => {
    const id = await pairAndQueue(); await repo.mutate(state => { state.users.find(u => u.id === fixture.buyer.id)!.locale = locale as "ru" | "en"; });
    await deliverNotification(id); const data = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(data.text).toContain(locale === "ru" ? "запись подтверждена" : "booking confirmed");
  });
  it("missing bot credentials do not affect email acceptance or cause email resend", async () => {
    const id = await pairAndQueue(); vi.stubEnv("TELEGRAM_BOT_TOKEN", ""); expect(notificationsReady()).toBe(true);
    await expect(deliverNotification(id)).rejects.toThrow("Telegram");
    expect((await notice(id)).status).toBe("sent"); expect((await notice(id)).error).toBeUndefined(); expect((await notice(id)).delivery?.telegram?.status).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "424242:local_test_token"); await deliverNotification(id); expect(store.email).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not delay email for a recipient without Telegram consent", async () => {
    await repo.mutate(state => queueBookingNotices(state, state.bookings[0])); const id = (await repo.read()).notifications[0].id;
    vi.stubEnv("TELEGRAM_BOT_TOKEN", ""); await deliverNotification(id); expect((await notice(id)).status).toBe("sent"); expect(fetch).not.toHaveBeenCalled();
  });
  it("retries an explicit Telegram rejection without repeating accepted email", async () => {
    const id = await pairAndQueue(); const secret = process.env.TELEGRAM_BOT_TOKEN!;
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: false, error_code: 403, description: `https://api.telegram.org/bot${secret}/sendMessage chat_id=123456` }, { status: 403 }));
    const error = await deliverNotification(id).catch(error => error as Error);
    expect(error).toBeInstanceOf(Error);
    const errors = `${(error as Error).message} ${(await notice(id)).delivery?.telegram?.error}`;
    expect(errors).not.toContain(secret); expect(errors).not.toContain("123456"); expect(errors).not.toContain("api.telegram.org");
    await deliverNotification(id); expect(store.email).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(2); expect((await notice(id)).delivery?.telegram?.status).toBe("sent");
  });
  it("respects Telegram retry_after while email stays sent", async () => {
    const id = await pairAndQueue(); vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: false, error_code: 429, parameters: { retry_after: 120 } }, { status: 429 }));
    await expect(deliverNotification(id)).rejects.toThrow(); await expect(deliverNotification(id)).rejects.toThrow("rate limit"); expect(fetch).toHaveBeenCalledTimes(1); expect(store.email).toHaveBeenCalledTimes(1);
    await repo.mutate(state => { (state.notifications.find(n => n.id === id) as Notice).delivery!.telegram!.retryAt = now() - 1; }); await deliverNotification(id); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("persists uncertainty on timeout and never blindly sends a duplicate", async () => {
    const id = await pairAndQueue(); const secret = process.env.TELEGRAM_BOT_TOKEN!;
    vi.mocked(fetch).mockRejectedValueOnce(new Error(`https://api.telegram.org/bot${secret}/sendMessage chat_id=123456`));
    const error = await deliverNotification(id).catch(error => error as Error);
    expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain("unknown");
    const errors = `${(error as Error).message} ${(await notice(id)).delivery?.telegram?.error}`;
    expect(errors).not.toContain(secret); expect(errors).not.toContain("123456"); expect(errors).not.toContain("api.telegram.org");
    await expect(deliverNotification(id)).rejects.toThrow("manual reconciliation");
    expect(fetch).toHaveBeenCalledTimes(1); expect(store.email).toHaveBeenCalledTimes(1); expect((await notice(id)).delivery?.telegram?.status).toBe("unknown");
    expect((await notice(id)).error).toBeUndefined();
  });
  it("retains Telegram acceptance when Resend rejects and retries only email", async () => {
    const id = await pairAndQueue(); store.email.mockResolvedValueOnce({ error: { message: "failed" } });
    await expect(deliverNotification(id)).rejects.toThrow(); expect((await notice(id)).status).toBe("failed"); expect((await notice(id)).delivery?.telegram?.status).toBe("sent");
    await deliverNotification(id); expect(store.email).toHaveBeenCalledTimes(2); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["disconnect", "reconnect", "email", "reschedule", "cancel"])("suppresses stale Telegram consent or version after %s", async change => {
    const id = await pairAndQueue();
    await repo.mutate(state => {
      if (change === "disconnect") disconnectTelegram(state, fixture.buyer);
      if (change === "reconnect") applyTelegramUpdate(state, update(token(createTelegramPair(state, fixture.buyer).url), 999999));
      if (change === "email") state.users.find(u => u.id === fixture.buyer.id)!.email = "changed@example.com";
      if (change === "reschedule") state.bookings[0].version++;
      if (change === "cancel") state.bookings[0].status = "cancelled";
    });
    await deliverNotification(id); expect(fetch).not.toHaveBeenCalled(); expect((await notice(id)).delivery?.telegram?.status).toBe("suppressed");
  });
  it("the transactional store refuses reassignment to another buyer", async () => {
    await pairAndQueue();
    await expect(repo.mutate(state => { state.bookings[0].buyerId = fixture.other.id; })).rejects.toThrow("Immutable buyerId");
    expect((await repo.read()).bookings[0].buyerId).toBe(fixture.buyer.id);
  });
  it("does not send future or already-started reminders", async () => {
    await pairAndQueue(); const id = (await repo.read()).notifications.find(n => n.kind.startsWith("booking_reminder"))!.id;
    await expect(deliverNotification(id)).rejects.toThrow("not due"); expect(fetch).not.toHaveBeenCalled(); expect(store.email).not.toHaveBeenCalled();
    await repo.mutate(state => { state.bookings[0].startAt = new Date(now() - 1000).toISOString(); }); await deliverNotification(id); expect(fetch).not.toHaveBeenCalled();
  });
});
