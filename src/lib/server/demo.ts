import "server-only";
import path from "node:path";
import { ApiError } from "./http";

export function isDemoMode(): boolean { return process.env.PAGER_DEMO === "true"; }
export function demoDirectory(): string {
  // Demo files are generated only at local runtime. Do not trace the configurable
  // directory into a production bundle (it may contain private customer fixtures).
  return path.resolve(/* turbopackIgnore: true */ process.env.PAGER_DATA_DIR || path.join(process.cwd(), ".data", "pager-demo"));
}
export function isLoopbackHost(host: string): boolean {
  try { const url = new URL(`http://${host}`); return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()) && !url.username && !url.password; } catch { return false; }
}
function localProxy(headers: Headers): boolean {
  const forwarded = headers.get("x-forwarded-for");
  return !headers.has("forwarded") && (!forwarded || forwarded.split(",").every(ip => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip.trim())));
}
export function assertDemoRequest(request: Request): void {
  if (!isDemoMode()) throw new ApiError(404, "Demo disabled");
  const url = new URL(request.url); const host = request.headers.get("host") ?? url.host;
  if (!isLoopbackHost(url.host) || !isLoopbackHost(host) || !localProxy(request.headers) || (request.headers.has("x-forwarded-host") && request.headers.get("x-forwarded-host") !== host)) throw new ApiError(403, "Demo is available only on loopback");
}
export async function guardDemoContext(): Promise<void> {
  if (!isDemoMode()) return;
  // Non-request test/seed processes are allowed only outside production.
  let context: Headers;
  try { const { headers } = await import("next/headers"); context = await headers(); }
  catch { if (process.env.NODE_ENV === "production") throw new ApiError(403, "Loopback request required for demo"); return; }
  const host = context.get("host") ?? "";
  if (!isLoopbackHost(host) || !localProxy(context) || (context.has("x-forwarded-host") && context.get("x-forwarded-host") !== host)) throw new ApiError(403, "Demo is available only on loopback");
}
