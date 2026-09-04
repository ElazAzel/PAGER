import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { mutateState, readState, isDemoMode } from "../server/store";
import { appOrigin, env, integrationFor } from "./runtime";
import { decryptSecret, encryptSecret, IntegrationError } from "./security";
import type { CommerceIntegration } from "./model";

const API = "https://api.cal.com/v2";
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.number().positive() });
type Token = z.infer<typeof tokenSchema>;
export class CalRequestError extends IntegrationError {
  constructor(public providerStatus: number) { super(providerStatus === 409 ? 409 : [401, 403, 429].includes(providerStatus) ? 503 : 502, providerStatus === 409 ? "This time is no longer available / Это время уже занято" : "Cal request failed; retry or contact the creator / Не удалось связаться с Cal. Повторите запрос или свяжитесь с автором"); }
  get safeToRetry() { return [400, 401, 403, 404, 409, 422, 429].includes(this.providerStatus); }
}
async function providerRequest(path: string, token?: string, method = "GET", data?: unknown): Promise<unknown> {
  if (isDemoMode()) throw new IntegrationError(409, "Cal is disabled in local demo mode");
  // Slots use their own documented version; bookings use the current booking version.
  const version = path === "/slots" || path.startsWith("/slots?") || path.startsWith("/slots/") ? "2024-09-04" : "2026-02-25";
  const response = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", "cal-api-version": version, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20_000), cache: "no-store", redirect: "error" });
  if (!response.ok) throw new CalRequestError(response.status);
  const result: unknown = await response.json(); return result;
}
function saveTokens(integration: CommerceIntegration, tokens: Token) {
  integration.calAccessTokenEncrypted = encryptSecret(tokens.access_token, `${integration.ownerId}:cal-access`);
  integration.calRefreshTokenEncrypted = encryptSecret(tokens.refresh_token, `${integration.ownerId}:cal-refresh`);
  integration.calTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString(); integration.updatedAt = new Date().toISOString();
}
export async function exchangeCalCode(ownerId: string, code: string): Promise<void> {
  const tokens = tokenSchema.parse(await providerRequest("/auth/oauth2/token", undefined, "POST", { client_id: env("CAL_OAUTH_CLIENT_ID"), client_secret: env("CAL_OAUTH_CLIENT_SECRET"), grant_type: "authorization_code", code, redirect_uri: `${appOrigin()}/api/integrations/cal/callback` }));
  await mutateState(s => { const integration = integrationFor(s, ownerId); saveTokens(integration, tokens); delete integration.calApiKeyEncrypted; });
}
export async function calToken(ownerId: string): Promise<string> {
  // Serializing refresh under the store lock prevents two callers consuming one rotating refresh token.
  return mutateState(async state => {
    const integration = integrationFor(state, ownerId);
    if (integration.calAccessTokenEncrypted) {
      if (!integration.calTokenExpiresAt || Date.parse(integration.calTokenExpiresAt) < Date.now() + 60_000) {
        if (!integration.calRefreshTokenEncrypted) throw new IntegrationError(503, "Cal authorization expired; reconnect");
        const tokens = tokenSchema.parse(await providerRequest("/auth/oauth2/token", undefined, "POST", { client_id: env("CAL_OAUTH_CLIENT_ID"), client_secret: env("CAL_OAUTH_CLIENT_SECRET"), grant_type: "refresh_token", refresh_token: decryptSecret(integration.calRefreshTokenEncrypted, `${ownerId}:cal-refresh`) })); saveTokens(integration, tokens);
      }
      return decryptSecret(integration.calAccessTokenEncrypted, `${ownerId}:cal-access`);
    }
    if (integration.calApiKeyEncrypted) return decryptSecret(integration.calApiKeyEncrypted, `${ownerId}:cal-api`);
    throw new IntegrationError(503, "Creator Cal integration is not configured");
  });
}
export async function calRequest(ownerId: string, path: string, method = "GET", data?: unknown): Promise<unknown> { return providerRequest(path, await calToken(ownerId), method, data); }
export async function saveCalApiKey(ownerId: string, apiKey: string): Promise<void> {
  // Validate before persisting; a saved string alone is not a connected integration.
  await providerRequest("/me", apiKey);
  await mutateState(s => { const integration = integrationFor(s, ownerId); integration.calApiKeyEncrypted = encryptSecret(apiKey, `${ownerId}:cal-api`); delete integration.calAccessTokenEncrypted; delete integration.calRefreshTokenEncrypted; delete integration.calTokenExpiresAt; integration.updatedAt = new Date().toISOString(); });
}
export async function ensureCalWebhook(ownerId: string): Promise<void> {
  const subscriberUrl = `${appOrigin()}/api/webhooks/cal/${encodeURIComponent(ownerId)}`;
  const secret = await mutateState(state => { const integration = integrationFor(state, ownerId); if (!integration.calWebhookSecretEncrypted) integration.calWebhookSecretEncrypted = encryptSecret(randomBytes(32).toString("hex"), `${ownerId}:cal-webhook`); return decryptSecret(integration.calWebhookSecretEncrypted, `${ownerId}:cal-webhook`); });
  const integration = (await readState()).integrations.find(i => i.ownerId === ownerId) as CommerceIntegration;
  const webhookId = integration.commerce?.calWebhookId;
  const payload = { subscriberUrl, triggers: ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"], active: true, secret, version: "2021-10-20" };
  // Reuse existing subscription; also recover one created just before an interrupted DB commit.
  const list = z.object({ data: z.array(z.object({ id: z.union([z.string(), z.number()]), subscriberUrl: z.string() })) }).parse(await calRequest(ownerId, "/webhooks"));
  const existing = list.data.find(w => w.id === webhookId || w.subscriberUrl === subscriberUrl);
  const result = z.object({ data: z.object({ id: z.union([z.string(), z.number()]) }) }).parse(await calRequest(ownerId, existing ? `/webhooks/${encodeURIComponent(existing.id)}` : "/webhooks", existing ? "PATCH" : "POST", payload));
  await mutateState(state => { const integration = integrationFor(state, ownerId); const meta = integration.commerce ??= {}; meta.calWebhookId = result.data.id; meta.calWebhookReady = true; });
}
export const calConfigSchema = z.object({ apiKey: z.string().min(10).max(2048).optional(), calLink: z.string().max(300).optional() }).strict();
export function validateCalLink(input: string): string {
  const url = new URL(input.startsWith("https://") ? input : `https://cal.com/${input.replace(/^\//, "")}`);
  if (url.origin !== "https://cal.com" || url.username || url.password || url.search || url.hash || !/^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(url.pathname)) throw new IntegrationError(400, "Expected a Cal event link: https://cal.com/creator/event");
  return url.toString();
}
