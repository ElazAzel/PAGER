import { spawn } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const require = createRequire(import.meta.url);
const dataDir = await mkdtemp(path.join(tmpdir(), "pager-release-gate-"));
const port = process.env.PAGER_GATE_PORT || "3100";
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error("Invalid PAGER_GATE_PORT");
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", PAGER_DEMO: "true", PAGER_PILOT_MODE: "false", PAGER_PAYMENTS_ENABLED: "false", PAGER_NOTIFICATIONS_ENABLED: "false", PAGER_TELEGRAM_ENABLED: "false", PAGER_APP_URL: origin, PAGER_SMOKE_URL: origin, PAGER_DATA_DIR: dataDir, PAGER_DEMO_SESSION_SECRET: randomBytes(32).toString("hex"), PAGER_DEMO_ADMIN_USER_IDS: "creator-anna" };

async function run(file, args = []) {
  const child = spawn(process.execPath, [file, ...args], { env, stdio: "inherit", windowsHide: true });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${path.basename(file)} exited with ${code}`)));
  });
}

let server;
try {
  // Refuse to reuse another local server or its data.
  const occupied = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
  if (occupied) throw new Error(`Port ${port} is occupied; choose PAGER_GATE_PORT`);
  await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
  await cp("public", ".next/standalone/public", { recursive: true });
  server = spawn(process.execPath, [".next/standalone/server.js"], { env: { ...env, HOSTNAME: "127.0.0.1", PORT: port }, stdio: "inherit", windowsHide: true });
  let serverError;
  server.once("error", error => { serverError = error; });
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Server exited with ${server.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(3000) });
      const health = await response.json();
      if (response.ok && health.demo === true && health.readiness?.ready === true) { ready = true; break; }
    } catch { /* Wait for startup, bounded by the deadline. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Isolated demo did not become ready");
  await run(require.resolve("@playwright/test/cli"), ["test"]);
  await run("scripts/smoke-discovery.mjs");
  await run("scripts/smoke-api.mjs");
  console.log("Release demo gate passed. External providers were not exercised.");
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGTERM");
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
    if (server.exitCode === null) { server.kill("SIGKILL"); await exited; }
  }
  const resolved = path.resolve(dataDir);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("pager-release-gate-")) throw new Error("Refusing unsafe temp cleanup");
  await rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
