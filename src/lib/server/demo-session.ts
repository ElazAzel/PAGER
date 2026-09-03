import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_IDENTITIES } from "./seed";
import { demoDirectory } from "./demo";

export const DEMO_COOKIE = "pager_demo_session";
export const DEMO_TTL_SECONDS = 8 * 3600;
const identities = Object.values(DEMO_IDENTITIES).flatMap(x => Object.values(x)) as string[];
export function signDemoSession(userId: string, secret: string, now = Date.now()): string {
  if (!identities.includes(userId) || secret.length < 32) throw new Error("Invalid demo session configuration");
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: now + DEMO_TTL_SECONDS * 1000, audience: "pager-loopback-demo" })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifyDemoSession(value: string | undefined, secret: string, now = Date.now()): string | null {
  if (!value || value.length > 1000 || secret.length < 32) return null;
  const pieces = value.split("."); if (pieces.length !== 2) return null;
  const expected = createHmac("sha256", secret).update(pieces[0]).digest();
  const supplied = Buffer.from(pieces[1], "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try { const payload = JSON.parse(Buffer.from(pieces[0], "base64url").toString("utf8")); return payload.audience === "pager-loopback-demo" && identities.includes(payload.sub) && Number.isFinite(payload.exp) && payload.exp > now && payload.exp <= now + DEMO_TTL_SECONDS * 1000 ? payload.sub : null; } catch { return null; }
}
export async function demoSecret(): Promise<string> {
  if (process.env.PAGER_DEMO_SESSION_SECRET) { if (process.env.PAGER_DEMO_SESSION_SECRET.length < 32) throw new Error("Demo secret must contain at least 32 characters"); return process.env.PAGER_DEMO_SESSION_SECRET; }
  await mkdir(demoDirectory(), { recursive: true, mode: 0o700 });
  const filename = path.join(demoDirectory(), "session.key");
  try { const handle = await open(filename, "wx", 0o600); try { await handle.writeFile(randomBytes(48).toString("base64url")); await handle.sync(); } finally { await handle.close(); } }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const secret = await readFile(filename, "utf8");
  if (secret.length < 32) throw new Error("Invalid persisted demo session secret"); return secret;
}
