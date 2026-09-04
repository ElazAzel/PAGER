import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, verifyCalSignature, assertDemoRequest, consumeOAuthState, newOAuthState } from "../src/lib/integrations/security";

describe("provider security", () => {
  it("Cal HMAC authenticates exact raw bytes and rejects missing, malformed, changed signatures", () => {
    const raw = '{"triggerEvent":"BOOKING_CREATED"}'; const secret = "a sufficiently strong webhook secret";
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    expect(verifyCalSignature(raw, signature, secret)).toBe(true);
    for (const bad of ["", "xyz", "0".repeat(64), signature + "00"]) expect(verifyCalSignature(raw, bad, secret)).toBe(false);
    expect(verifyCalSignature(raw + " ", signature, secret)).toBe(false);
  });
  it("AEAD encryption binds credentials to their owner and purpose", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const ciphertext = encryptSecret("cal_private_key", "c1:cal-api", key);
    expect(ciphertext).not.toContain("cal_private_key"); expect(decryptSecret(ciphertext, "c1:cal-api", key)).toBe("cal_private_key");
    expect(() => decryptSecret(ciphertext, "c2:cal-api", key)).toThrow();
    expect(() => decryptSecret(ciphertext.slice(0, -2) + "aa", "c1:cal-api", key)).toThrow();
  });
  it("requires explicit demo mode, loopback URL and no remote proxy host", () => {
    expect(() => assertDemoRequest(new Request("http://127.0.0.1:3000/api/checkout"), true)).not.toThrow();
    for (const request of [new Request("https://pager.example/api/checkout"), new Request("http://localhost:3000/api/checkout", { headers: { "x-forwarded-host": "pager.example" } }), new Request("http://localhost.evil.test/api/checkout")]) expect(() => assertDemoRequest(request, true)).toThrow();
    expect(() => assertDemoRequest(new Request("http://localhost:3000"), false)).toThrow();
  });
  it("allows a same-origin browser request through a loopback-preserving dev proxy", () => {
    expect(() => assertDemoRequest(new Request("http://127.0.0.1:3000/api/checkout", {
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "x-forwarded-for": "10.0.0.8",
      },
    }), true)).not.toThrow();
    expect(() => assertDemoRequest(new Request("http://127.0.0.1:3000/api/checkout", {
      headers: {
        host: "127.0.0.1:3000",
        origin: "https://evil.test",
        "x-forwarded-for": "10.0.0.8",
      },
    }), true)).toThrow();
  });
  it("OAuth nonce is single-use, provider-bound, owner-bound and expires", () => {
    const pair = newOAuthState("owner", "cal", 1000);
    expect(() => consumeOAuthState(pair.record, pair.state, "other", "cal", 1001)).toThrow();
    expect(() => consumeOAuthState(pair.record, pair.state, "owner", "stripe", 1001)).toThrow();
    consumeOAuthState(pair.record, pair.state, "owner", "cal", 1001);
    expect(() => consumeOAuthState(pair.record, pair.state, "owner", "cal", 1002)).toThrow();
    const expired = newOAuthState("owner", "cal", 1000);
    expect(() => consumeOAuthState(expired.record, expired.state, "owner", "cal", 700001)).toThrow();
  });
});
