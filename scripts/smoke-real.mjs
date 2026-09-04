const target = process.env.PAGER_REAL_URL;
if (!target) throw new Error("PAGER_REAL_URL is required");
const url = new URL(target);
if (url.protocol !== "https:") throw new Error("Real smoke requires an HTTPS URL");

const response = await fetch(new URL("/api/health", url));
const payload = await response.json();
if (payload.demo === true || payload.readiness?.mode === "demo") throw new Error("Real smoke reached demo mode");
if (response.status !== 200 || payload.status !== "ok" || payload.readiness?.ready !== true) {
  throw new Error(`Real environment is not ready (HTTP ${response.status})`);
}
if (!payload.readiness.checks.core.configured) throw new Error("Core runtime is not configured");
console.log("Real readiness smoke passed: HTTPS, real mode and core configuration are ready.");
