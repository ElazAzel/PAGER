import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const image = process.env.PAGER_CONTAINER_IMAGE || "pager:release-check";
const origin = "http://127.0.0.1:3101";
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
let id;
try {
  const uid = docker("run", "--rm", "--entrypoint", "node", image, "-e", "console.log(process.getuid()); if (require('node:fs').readdirSync('.').some(p => p.startsWith('.env'))) process.exit(1)");
  assert.equal(uid, "1001", "Container must run as the non-root app user and contain no env files");
  id = docker("run", "--detach", "--publish", "127.0.0.1:3101:3000", "--env", "PAGER_DEMO=true", "--env", "PAGER_PILOT_MODE=false", "--env", `PAGER_APP_URL=${origin}`, "--env", "PAGER_DATA_DIR=/tmp/pager-container-smoke", "--env", `PAGER_DEMO_SESSION_SECRET=${randomBytes(32).toString("hex")}`, image);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`, { headers: { origin }, signal: AbortSignal.timeout(2000) });
      const health = await response.json();
      if (response.ok && health.demo && health.readiness?.ready) { ready = true; break; }
    } catch { /* Await container readiness. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Container health failed");
  for (const pathname of ["/", "/anna", "/icon-192.png", "/manifest.webmanifest"]) {
    assert((await fetch(`${origin}${pathname}`, { headers: { origin }, signal: AbortSignal.timeout(10_000) })).ok, `Container path failed: ${pathname}`);
  }
  console.log("Container smoke passed: standalone boot, non-root user, no env files, health, SSR and static assets. Local demo only.");
} catch (error) {
  if (id) console.error(docker("logs", id));
  throw error;
} finally {
  if (id) docker("rm", "--force", id);
}
