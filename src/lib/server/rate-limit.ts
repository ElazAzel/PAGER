import "server-only";
import { createHash } from "node:crypto";
import { mutateState } from "./store";
import { ApiError } from "./http";

// A server-only persisted ledger uses the existing webhooks envelope so it shares
// the same transaction/advisory lock and cannot be reset by a different worker.
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const now = Date.now(); const id = `rate:${createHash("sha256").update(key).digest("hex")}:${Math.floor(now / windowMs)}`;
  const allowed = await mutateState(state => {
    type Counter = DatabaseStateRate;
    const row = state.webhooks.find(e => e.id === id) as Counter | undefined;
    if (row && (row.count ?? 0) >= limit) return false;
    if (row) row.count = (row.count ?? 0) + 1;
    else state.webhooks.push({ id, provider: "cal", processedAt: new Date(now).toISOString(), count: 1, expiresAt: now + windowMs * 2 } as Counter);
    state.webhooks = state.webhooks.filter(e => !e.id.startsWith("rate:") || ((e as Counter).expiresAt ?? 0) > now);
    return true;
  });
  if (!allowed) throw new ApiError(429, "Too many requests / Слишком много запросов");
}
type DatabaseStateRate = import("../types").WebhookEvent & { count: number; expiresAt: number };
export function requestKey(request: Request): string {
  // Deploy behind a trusted proxy which overwrites this header. A second resource
  // budget is enforced by callers, independent of client-supplied IP addresses.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 128) || "unknown";
}
