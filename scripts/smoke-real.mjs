const target = process.env.PAGER_REAL_URL;
if (!target) throw new Error("PAGER_REAL_URL is required");
const url = new URL(target);
if (url.protocol !== "https:" || url.username || url.password) throw new Error("Real smoke requires an HTTPS URL without credentials");

const response = await fetch(new URL("/api/health", url), { signal: AbortSignal.timeout(20_000) });
const payload = await response.json();
if (payload.demo === true || payload.readiness?.mode === "demo") throw new Error("Real smoke reached demo mode");
if (response.status !== 200 || payload.status !== "ok" || payload.readiness?.ready !== true) {
  throw new Error(`Real environment is not ready (HTTP ${response.status})`);
}
if (!payload.readiness.checks.core.configured) throw new Error("Core runtime is not configured");
if (!payload.readiness.checks.legal?.configured) throw new Error("Operator identity and support contact are missing");
if (payload.capabilities?.payments && payload.readiness.checks.stripe.status !== "ready") throw new Error("Enabled payments are not configured");
if (Object.values(payload.readiness.checks).some(check => check.status === "missing")) throw new Error("An enabled runtime dependency is missing");
for (const path of ["/", "/login", "/privacy", "/terms", "/manifest.webmanifest", "/icon-192.png"]) {
  const page = await fetch(new URL(path, url), { signal: AbortSignal.timeout(20_000) });
  if (!page.ok) throw new Error(`Real route failed: ${path} (HTTP ${page.status})`);
}
console.log("Real smoke passed: HTTPS, database read, runtime configuration, legal contact and public routes. Provider transactions require separate certification.");
