import { isDemoMode, readState } from "@/lib/server/store";
import { json } from "@/lib/server/http";
import { getCapabilities } from "@/lib/server/capabilities";
import { runtimeReadiness } from "@/lib/server/readiness";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { const started = Date.now(); const readiness = runtimeReadiness(); try { await readState(); const status = readiness.ready ? "ok" : "degraded"; return json({ status, demo: isDemoMode(), capabilities: getCapabilities(), readiness, latencyMs: Date.now() - started }, status === "ok" ? 200 : 503); } catch { return json({ status: "degraded", demo: isDemoMode(), capabilities: getCapabilities(), readiness, latencyMs: Date.now() - started }, 503); } }
