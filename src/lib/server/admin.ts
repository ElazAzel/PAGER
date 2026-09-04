import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AdminAuditEvent, DatabaseState, Locale, Order, Page, User } from "../types";
import type { CommerceOrder } from "../integrations/model";
import type { Notice } from "../integrations/notification-queue";
import { currentUser, supabaseAuth } from "./auth";
import { ApiError } from "./http";
import { isDemoMode, mutateState, readState } from "./store";
import { creatorAnalyticsReport } from "./metrics";
import { rateLimit } from "./rate-limit";

export type AdminPeriod = 7 | 30;
export type AdminOverview = {
  demo: boolean;
  locale: Locale;
  generatedAt: string;
  period: { days: AdminPeriod; from: string; to: string };
  totals: { users: number; creators: number; buyers: number; pages: number; publishedPages: number };
  activity: { views: number; visitors: number; clicks: number; activePages: number; conversions: number; northStar: number };
  payments: { paidOrders: number; amountsByCurrency: Record<string, number> };
  operations: { paymentFailures: number; notificationFailures: number; failedOrders: number; disputedOrders: number; failedNotifications: number; pendingNotifications: number; overdueNotifications: number };
  integrations: Array<{ id: "supabase" | "stripe" | "cal" | "email" | "jobs" | "telegram"; configured: boolean; mode: "demo" | "disabled" | "missing" | "configured" | "test" | "live"; health: "unverified"; checkedAt: null; errors: number }>;
  connections: { stripe: number; stripeReady: number; cal: number };
  pages: Array<{ id: string; creatorId: string; title: string; path: string; publishedAt: string; views: number; conversions: number }>;
  pageList: { total: number; limit: number };
};

/** Accept only the identity returned by currentUser(), never request input or user_metadata. */
export function isAdminUser(user: Pick<User, "id"> | null): boolean {
  if (!user?.id) return false;
  const value = isDemoMode() ? process.env.PAGER_DEMO_ADMIN_USER_IDS : process.env.PAGER_ADMIN_USER_IDS;
  return (value ?? "").split(",").map(id => id.trim()).filter(Boolean).includes(user.id);
}

/** Identity-only guard is exclusively for the administrator's own MFA setup. */
export async function requireAdminIdentity(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Sign in required / Войдите в аккаунт");
  if (!isAdminUser(user)) throw new ApiError(403, "Administrator access required / Требуется доступ администратора");
  return user;
}

export class AdminMfaRequired extends ApiError {
  constructor() { super(403, "Complete administrator MFA at /admin/mfa / Подтвердите второй фактор на /admin/mfa"); }
}

export async function requireAdmin(): Promise<User> {
  const user = await requireAdminIdentity();
  // The separate demo allowlist and loopback guards still apply. There is no
  // environment variable that can disable MFA for a real Supabase session.
  if (isDemoMode() || (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.PAGER_ADMIN_MFA_REQUIRED)) return user;
  const client = await supabaseAuth();
  const claims = await client.auth.getClaims();
  if (claims.error || !claims.data || claims.data.claims.sub !== user.id) throw new AdminMfaRequired();
  // getAuthenticatorAssuranceLevel alone decodes cookie data; bind it to the
  // signed claims verified by Supabase, as well as currentUser's live getUser.
  if (claims.data.claims.aal !== "aal2") throw new AdminMfaRequired();
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data?.currentLevel !== "aal2") throw new AdminMfaRequired();
  return user;
}

export function adminPeriod(value: string | null | undefined): AdminPeriod {
  if (!value || value === "7") return 7;
  if (value === "30") return 30;
  throw new ApiError(400, "Choose 7 or 30 days / Выберите 7 или 30 дней");
}

function providerConfiguration(demo: boolean, state: DatabaseState): AdminOverview["integrations"] {
  const has = (...names: string[]) => names.every(name => !!process.env[name]?.trim());
  const setup: Array<{ id: AdminOverview["integrations"][number]["id"]; configured: boolean; enabled?: boolean }> = [
    { id: "supabase", configured: has("DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY") },
    { id: "stripe", configured: has("STRIPE_SECRET_KEY", "STRIPE_CONNECT_CLIENT_ID", "STRIPE_WEBHOOK_SECRET", "PAGER_INTEGRATION_KEY") },
    { id: "cal", configured: has("CAL_OAUTH_CLIENT_ID", "CAL_OAUTH_CLIENT_SECRET", "PAGER_INTEGRATION_KEY") },
    { id: "email", configured: has("RESEND_API_KEY", "RESEND_FROM", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"), enabled: process.env.PAGER_NOTIFICATIONS_ENABLED === "true" },
    { id: "jobs", configured: has("INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY") },
    { id: "telegram", configured: has("TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET", "PAGER_INTEGRATION_KEY"), enabled: process.env.PAGER_TELEGRAM_ENABLED === "true" },
  ];
  const notices = state.notifications.filter(notice => !notice.test && !(notice as Notice).delivery?.suppressed) as Notice[];
  return setup.map(item => ({ id: item.id, configured: !demo && item.configured, mode: demo ? "demo" : item.enabled === false ? "disabled" : !item.configured ? "missing" : item.id === "stripe" ? process.env.PAGER_STRIPE_LIVE === "true" ? "live" : "test" : "configured", health: "unverified", checkedAt: null,
    // Historical operation failures are an independent signal, never a health
    // check. Provider errors and their possibly sensitive payloads stay private.
    errors: demo ? 0 : item.id === "stripe" ? state.orders.filter(order => isRealOrder(order) && order.status === "failed").length : item.id === "email" ? notices.filter(notice => notice.status === "failed").length : item.id === "jobs" ? notices.filter(notice => notice.status === "pending" && !!notice.error && !notice.delivery?.dispatchedAt).length : item.id === "telegram" ? notices.filter(notice => ["failed", "unknown"].includes(notice.delivery?.telegram?.status ?? "")).length : 0,
  }));
}

const isRealOrder = (order: Order) => !order.test && order.buyerId !== order.ownerId && !(order as CommerceOrder).commerce?.sandbox;

/** Explicit DTO: adding a field to stored state must never add it to the admin response. */
export function summarizeAdminState(state: DatabaseState, days: AdminPeriod, demo: boolean, locale: Locale = "ru", now = new Date()): AdminOverview {
  const end = now.getTime();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1);
  const inPeriod = (value: string) => Date.parse(value) >= start && Date.parse(value) <= end;
  const published = state.publishedPages.filter(page => !!page.publishedAt);
  const publishedIds = new Set(published.map(page => page.id));
  const events = demo ? [] : state.analytics.filter(event => !event.test && !event.isBot && !event.isOwner && event.visitorId !== event.ownerId && inPeriod(event.createdAt));
  const views = events.filter(event => event.kind === "view");
  const activePages = new Set(views.filter(event => publishedIds.has(event.pageId)).map(event => event.pageId)).size;
  const owners = new Map(state.users.map(user => [user.id, user]));
  const realOrders = demo ? [] : state.orders.filter(isRealOrder);
  // Reuse the creator report's verified payment ledger and conversion rules. Only its
  // numeric summary is copied: the report's private block labels stay on the server.
  const reports = (demo ? [] : state.users.filter(user => user.role === "creator")).map(user => creatorAnalyticsReport(state, user, { days, now }));
  const sum = (key: "views" | "visitors" | "clicks" | "conversions" | "paidOrders") => reports.reduce((total, report) => total + report.summary[key], 0);
  const amountsByCurrency: Record<string, number> = {};
  for (const report of reports) {
    for (const [currency, amount] of Object.entries(report.summary.revenueByCurrency)) {
      if (/^[A-Z]{3}$/.test(currency) && Number.isSafeInteger(amount) && amount >= 0) amountsByCurrency[currency] = (amountsByCurrency[currency] ?? 0) + amount;
    }
  }
  const notices = demo ? [] : state.notifications.filter(notice => !notice.test && !(notice as typeof notice & { delivery?: { suppressed?: boolean } }).delivery?.suppressed);
  const integrations = state.integrations.filter(integration => owners.get(integration.ownerId)?.role === "creator");
  const pageViews = new Map<string, number>();
  for (const event of views) pageViews.set(event.pageId, (pageViews.get(event.pageId) ?? 0) + 1);
  return {
    demo, locale, generatedAt: now.toISOString(), period: { days, from: new Date(start).toISOString(), to: now.toISOString() },
    totals: { users: state.users.length, creators: state.users.filter(user => user.role === "creator").length, buyers: state.users.filter(user => user.role === "buyer").length, pages: state.pages.length, publishedPages: published.length },
    activity: { views: sum("views"), visitors: sum("visitors"), clicks: sum("clicks"), activePages, conversions: sum("conversions"), northStar: activePages ? sum("conversions") / activePages : 0 },
    payments: { paidOrders: sum("paidOrders"), amountsByCurrency },
    operations: { paymentFailures: events.filter(event => event.kind === "payment_failed").length, notificationFailures: events.filter(event => event.kind === "notification_failed").length, failedOrders: realOrders.filter(order => order.status === "failed" && inPeriod(order.createdAt)).length, disputedOrders: realOrders.filter(order => order.status === "disputed").length, failedNotifications: notices.filter(notice => notice.status === "failed").length, pendingNotifications: notices.filter(notice => notice.status === "pending").length, overdueNotifications: notices.filter(notice => notice.status === "pending" && Date.parse(notice.scheduledAt) <= end).length },
    integrations: providerConfiguration(demo, state),
    connections: { stripe: integrations.filter(integration => !!integration.stripeAccountId).length, stripeReady: integrations.filter(integration => !!integration.stripeAccountId && integration.stripeReady).length, cal: integrations.filter(integration => !!(integration.calApiKeyEncrypted || integration.calAccessTokenEncrypted)).length },
    pages: [...published].sort((a, b) => (pageViews.get(b.id) ?? 0) - (pageViews.get(a.id) ?? 0) || a.id.localeCompare(b.id)).slice(0, 50).map(page => {
      const owner = owners.get(page.ownerId);
      const conversions = !demo && owner?.role === "creator" ? creatorAnalyticsReport({ ...state, pages: state.pages.filter(draft => draft.id === page.id) }, owner, { days, now }).summary.conversions : 0;
      return { id: page.id, creatorId: page.ownerId, title: page.title, path: `/${encodeURIComponent(page.slug)}`, publishedAt: page.publishedAt!, views: pageViews.get(page.id) ?? 0, conversions };
    }),
    pageList: { total: published.length, limit: 50 },
  };
}

export async function loadAdminOverview(days: AdminPeriod = 7): Promise<AdminOverview> {
  // The platform-wide snapshot is loaded only after verified identity and allowlist checks.
  const user = await requireAdmin();
  return summarizeAdminState(await readState(), days, isDemoMode(), user.locale);
}

export async function loadAdminWorkspace() {
  const user = await requireAdmin();
  const state = await readState();
  const demo = isDemoMode();
  const query = { q: "", page: 1, limit: 20 };
  return { overview: summarizeAdminState(state, 7, demo, user.locale), creators: summarizeAdminCreators(state, query, demo), audit: summarizeAdminAudit(state, query) };
}

export type AdminPagination = { page: number; limit: number; total: number; totalPages: number };
export type AdminListQuery = { q: string; page: number; limit: number };
export type AdminPublication = {
  id: string; title: string | null; slug: string | null; path: string | null; publishedAt: string | null;
  status: "draft" | "published" | "blocked"; moderation: { status: "active" | "blocked"; version: number; reason: string; updatedAt: string | null };
};
export type AdminCreator = { id: string; name: string; locale: Locale; createdAt: string; publication: AdminPublication | null; onboarding: { draft: boolean; published: boolean; paymentsConnected: boolean; chargesEnabled: boolean; bookingConnected: boolean } };
export type AdminCreatorList = { creators: AdminCreator[]; pagination: AdminPagination; query: string; demo: boolean };
export type AdminCreatorDetail = AdminCreator & { demo: boolean; summary: { days: 30; views: number; conversions: number; paidOrders: number; revenueByCurrency: Record<string, number> }; operations: { failedOrders: number; failedNotifications: number; pendingNotifications: number } };
export type AdminAuditList = { events: Array<AdminAuditEvent & { publication: { title: string; path: string } | null }>; pagination: AdminPagination };

export function adminListQuery(params: URLSearchParams): AdminListQuery {
  const q = (params.get("q") ?? "").trim();
  const parse = (value: string | null, fallback: number, maximum: number) => {
    if (value === null) return fallback;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) throw new ApiError(400, "Invalid pagination / Некорректная страница выдачи");
    return Number(value);
  };
  if (q.length > 120) throw new ApiError(400, "Search is too long / Слишком длинный поисковый запрос");
  return { q, page: parse(params.get("page"), 1, 100_000), limit: parse(params.get("limit"), 20, 50) };
}

function paginate<T>(rows: T[], page: number, limit: number) {
  return { rows: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) } };
}

function publicationMetadata(draft: Page | undefined, published: Page | undefined): AdminPublication | null {
  const page = draft ?? published;
  if (!page) return null;
  const moderation = page.moderation ?? published?.moderation;
  const blocked = moderation?.status === "blocked";
  return { id: page.id, title: published?.publishedAt ? published.title : null, slug: published?.publishedAt ? published.slug : null, path: published?.publishedAt ? `/${encodeURIComponent(published.slug)}` : null, publishedAt: published?.publishedAt ?? null,
    status: blocked ? "blocked" : published?.publishedAt ? "published" : "draft",
    moderation: { status: blocked ? "blocked" : "active", version: moderation?.version ?? 0, reason: moderation?.reason ?? "", updatedAt: moderation?.updatedAt ?? null } };
}

function creatorMetadata(state: DatabaseState, creator: User): AdminCreator {
  const draft = state.pages.find(page => page.ownerId === creator.id);
  const published = state.publishedPages.find(page => page.ownerId === creator.id && (!draft || page.id === draft.id));
  const connection = state.integrations.find(integration => integration.ownerId === creator.id);
  return { id: creator.id, name: creator.name, locale: creator.locale, createdAt: creator.createdAt, publication: publicationMetadata(draft, published),
    onboarding: { draft: !!draft, published: !!published?.publishedAt, paymentsConnected: !!connection?.stripeAccountId, chargesEnabled: !!connection?.stripeAccountId && !!connection.stripeReady, bookingConnected: !!(connection?.calApiKeyEncrypted || connection?.calAccessTokenEncrypted) } };
}

/** Creator names are allowed account metadata. Draft/block text and buyer data are never projected. */
export function summarizeAdminCreators(state: DatabaseState, query: AdminListQuery, demo: boolean): AdminCreatorList {
  const needle = query.q.toLocaleLowerCase();
  const creators = state.users.filter(user => user.role === "creator").map(user => creatorMetadata(state, user))
    .filter(creator => !needle || [creator.id, creator.name, creator.publication?.slug ?? ""].some(value => value.toLocaleLowerCase().includes(needle)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const result = paginate(creators, query.page, query.limit);
  return { creators: result.rows, pagination: result.pagination, query: query.q, demo };
}

export async function loadAdminCreators(query: AdminListQuery): Promise<AdminCreatorList> {
  await requireAdmin();
  return summarizeAdminCreators(await readState(), query, isDemoMode());
}

export function summarizeAdminCreator(state: DatabaseState, id: string, demo: boolean): AdminCreatorDetail {
  const creator = state.users.find(user => user.role === "creator" && user.id === id);
  if (!creator) throw new ApiError(404, "Creator not found / Автор не найден");
  const summary = demo ? null : creatorAnalyticsReport(state, creator, { days: 30 }).summary;
  const notices = demo ? [] : state.notifications.filter(notice => notice.ownerId === id && !notice.test && !(notice as Notice).delivery?.suppressed);
  return { ...creatorMetadata(state, creator), demo,
    summary: { days: 30, views: summary?.views ?? 0, conversions: summary?.conversions ?? 0, paidOrders: summary?.paidOrders ?? 0, revenueByCurrency: summary?.revenueByCurrency ?? {} },
    operations: { failedOrders: demo ? 0 : state.orders.filter(order => order.ownerId === id && isRealOrder(order) && order.status === "failed").length, failedNotifications: notices.filter(notice => notice.status === "failed").length, pendingNotifications: notices.filter(notice => notice.status === "pending").length } };
}

export async function loadAdminCreator(id: string): Promise<AdminCreatorDetail> {
  await requireAdmin();
  return summarizeAdminCreator(await readState(), id, isDemoMode());
}

export function summarizeAdminAudit(state: DatabaseState, query: AdminListQuery, pageId?: string): AdminAuditList {
  const events = (state.adminAudit ?? []).filter(event => !pageId || event.pageId === pageId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const result = paginate(events, query.page, query.limit);
  return { pagination: result.pagination, events: result.rows.map(event => {
    const page = state.publishedPages.find(page => page.id === event.pageId && page.publishedAt);
    return { id: event.id, actorId: event.actorId, action: event.action, pageId: event.pageId, reason: event.reason, createdAt: event.createdAt, before: event.before, after: event.after, publication: page ? { title: page.title, path: `/${encodeURIComponent(page.slug)}` } : null };
  }) };
}

export async function loadAdminAudit(query: AdminListQuery, pageId?: string): Promise<AdminAuditList> {
  await requireAdmin();
  return summarizeAdminAudit(await readState(), query, pageId);
}

export const moderationInput = z.object({ action: z.enum(["block", "restore"]), reason: z.string().trim().min(3).max(500), expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1) }).strict();
export type AdminModerationInput = z.infer<typeof moderationInput>;

/** Called only inside the repository's atomic mutation by moderateAdminPage. */
export function applyAdminModeration(state: DatabaseState, pageId: string, actorId: string, input: AdminModerationInput, now = new Date()): { pageId: string; moderation: NonNullable<Page["moderation"]>; auditId: string } {
  const change = moderationInput.parse(input);
  const draft = state.pages.find(page => page.id === pageId);
  const published = state.publishedPages.find(page => page.id === pageId);
  const page = draft ?? published;
  if (!page) throw new ApiError(404, "Page not found / Страница не найдена");
  const snapshots = [draft, published].filter((value): value is Page => !!value);
  const version = page.moderation?.version ?? 0;
  const before = page.moderation?.status ?? "active";
  if (version !== change.expectedVersion || snapshots.some(snapshot => snapshot.ownerId !== page.ownerId || (snapshot.moderation?.version ?? 0) !== version || (snapshot.moderation?.status ?? "active") !== before)) throw new ApiError(409, "Publication changed. Reload and review before retrying / Статус изменился. Обновите данные и проверьте действие");
  const after = change.action === "block" ? "blocked" : "active";
  if (after === before) throw new ApiError(409, "Publication already has this status / У публикации уже этот статус");
  const createdAt = now.toISOString();
  const moderation: NonNullable<Page["moderation"]> = { status: after, reason: change.reason, updatedAt: createdAt, version: version + 1 };
  for (const snapshot of snapshots) snapshot.moderation = { ...moderation };
  const event: AdminAuditEvent = { id: randomUUID(), actorId, action: change.action === "block" ? "publication.block" : "publication.restore", pageId, reason: change.reason, createdAt, before, after };
  (state.adminAudit ??= []).push(event);
  return { pageId, moderation, auditId: event.id };
}

export async function moderateAdminPage(pageId: string, input: AdminModerationInput) {
  const actor = await requireAdmin();
  return mutateState(state => applyAdminModeration(state, pageId, actor.id, input));
}

export type AdminMfaState = { demo: boolean; locale: Locale; factors: Array<{ id: string }>; verified: boolean };
export const adminMfaInput = z.discriminatedUnion("action", [z.object({ action: z.literal("enroll") }).strict(), z.object({ action: z.literal("verify"), factorId: z.string().min(1).max(128), code: z.string().regex(/^\d{6}$/) }).strict()]);

export async function loadAdminMfa(): Promise<AdminMfaState> {
  const user = await requireAdminIdentity();
  if (isDemoMode()) return { demo: true, locale: user.locale, factors: [], verified: true };
  const client = await supabaseAuth();
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) throw new ApiError(503, "MFA is temporarily unavailable / Второй фактор временно недоступен");
  const claims = await client.auth.getClaims();
  return { demo: false, locale: user.locale, factors: factors.data.totp.filter(factor => factor.status === "verified").map(factor => ({ id: factor.id })), verified: !claims.error && claims.data?.claims.sub === user.id && claims.data?.claims.aal === "aal2" };
}

export async function updateAdminMfa(raw: z.infer<typeof adminMfaInput>): Promise<{ verified: true } | { factorId: string; qrCode: string }> {
  const user = await requireAdminIdentity();
  if (isDemoMode()) throw new ApiError(409, "MFA is bypassed only in local demo / MFA отключён только в локальном деморежиме");
  const input = adminMfaInput.parse(raw);
  await rateLimit(`admin-mfa:${user.id}`, input.action === "enroll" ? 3 : 10, 10 * 60_000);
  const client = await supabaseAuth();
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) throw new ApiError(503, "MFA is temporarily unavailable / Второй фактор временно недоступен");
  if (input.action === "enroll") {
    if (factors.data.all.some(factor => factor.status === "verified")) throw new ApiError(409, "Use your existing second factor / Используйте уже настроенный второй фактор");
    // A restart can replace only this identity's unfinished TOTP enrollment.
    for (const factor of factors.data.all.filter(factor => factor.factor_type === "totp" && factor.status === "unverified")) {
      const removed = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) throw new ApiError(503, "Could not restart MFA setup / Не удалось перезапустить настройку MFA");
    }
    const result = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "PAGER administrator", issuer: "PAGER" });
    if (result.error || result.data.type !== "totp") throw new ApiError(503, "Could not set up MFA / Не удалось настроить второй фактор");
    return { factorId: result.data.id, qrCode: result.data.totp.qr_code };
  }
  if (!factors.data.all.some(factor => factor.id === input.factorId && factor.factor_type === "totp")) throw new ApiError(400, "Invalid second factor / Некорректный второй фактор");
  const result = await client.auth.mfa.challengeAndVerify({ factorId: input.factorId, code: input.code });
  if (result.error) throw new ApiError(400, "Invalid or expired code. Try again / Код неверен или устарел. Повторите попытку");
  // challengeAndVerify updates the session through the server client's cookie adapter.
  return { verified: true };
}
