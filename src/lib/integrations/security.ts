import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { OAuthState } from "./model";
export class IntegrationError extends Error { constructor(public status: number, message: string) { super(message); this.name = "IntegrationError"; } }
export function secretKey(encoded = process.env.PAGER_INTEGRATION_KEY): Buffer {
  const key = Buffer.from(encoded ?? "", "base64");
  if (key.length !== 32) throw new IntegrationError(503, "PAGER_INTEGRATION_KEY must be a base64 encoded 32-byte key");
  return key;
}
export function encryptSecret(plaintext: string, context: string, key?: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", secretKey(key), iv);
  cipher.setAAD(Buffer.from(context)); const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptSecret(ciphertext: string, context: string, key?: string): string {
  const [version, iv, tag, encrypted, extra] = ciphertext.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra) throw new IntegrationError(503, "Invalid encrypted provider credential");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(key), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
export function verifyCalSignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(raw).digest(), Buffer.from(signature, "hex"));
}
export function isLoopback(hostname: string): boolean { return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname.toLowerCase()); }
export function assertDemoRequest(request: Request, demo: boolean): void {
  const url = new URL(request.url);
  if (!demo || !isLoopback(url.hostname)) throw new IntegrationError(403, "Local demo requires explicit PAGER_DEMO=true and a loopback request");
  // A forwarded request is not local even when the reverse proxy targets localhost.
  const host = request.headers.get("host") ?? url.host;
  for (const header of ["host", "x-forwarded-host"]) {
    const host = request.headers.get(header);
    if (host && (host.includes(",") || !isLoopback(new URL(`http://${host}`).hostname))) throw new IntegrationError(403, "Demo is unavailable through a remote proxy");
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin = request.headers.get("origin");
  let sameOriginLoopback = false;
  if (origin && !request.headers.has("forwarded") && (!forwardedHost || forwardedHost === host)) {
    try {
      const originUrl = new URL(origin);
      sameOriginLoopback = originUrl.protocol === url.protocol && originUrl.port === url.port && isLoopback(originUrl.hostname) && isLoopback(new URL("http://" + host).hostname);
    } catch { sameOriginLoopback = false; }
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (request.headers.has("forwarded") || (forwarded && !forwarded.split(",").every(ip => isLoopback(ip.trim()) && ip.trim() !== "") && !sameOriginLoopback)) throw new IntegrationError(403, "Demo is unavailable through a remote proxy");
}
export function hashToken(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function newOAuthState(ownerId: string, provider: "stripe" | "cal", now = Date.now()): { state: string; record: OAuthState } {
  const state = randomBytes(32).toString("base64url");
  return { state, record: { hash: hashToken(state), ownerId, provider, expiresAt: now + 600_000 } };
}
export function consumeOAuthState(record: OAuthState | undefined, state: string, ownerId: string, provider: "stripe" | "cal", now = Date.now()): void {
  if (!record || record.used || !state || record.ownerId !== ownerId || record.provider !== provider || record.expiresAt <= now || record.hash !== hashToken(state)) throw new IntegrationError(403, "Invalid, expired or already-used OAuth state");
  record.used = true;
}
