import { describe, expect, it } from "vitest";
import { authPayload, authVerificationPayload, parseLoginRole, safeInternalReturnTo, postLoginDestination } from "../src/lib/auth-intent";

describe("login intent boundary", () => {
  it("preserves buyer fallback for creator workspace targets", () => {
    expect(postLoginDestination("buyer", "/dashboard")).toBe("/anna");
    expect(postLoginDestination("buyer", "/dashboard?from=login")).toBe("/anna");
    expect(postLoginDestination("buyer", "/anna/items/session")).toBe("/anna/items/session");
    expect(postLoginDestination("creator", "/anna")).toBe("/dashboard");
  });
  it.each([
    ["/anna", "/anna"],
    ["/admin/mfa", "/admin/mfa"],
    ["/anna/items/session?blockId=booking#details", "/anna/items/session?blockId=booking#details"],
    ["/anna/../purchases", "/purchases"],
  ])("keeps canonical same-origin navigation %s", (input, expected) => {
    expect(safeInternalReturnTo(input)).toBe(expected);
  });

  it.each([
    null,
    "",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://evil.example/path",
    "//evil.example/path",
    "\\\\evil.example\\path",
    "/\\evil.example/path",
    "/%2f%2fevil.example/path",
    "/%5cevil.example/path",
    "/safe/..//evil.example/path",
    "/%2e//evil.example/path",
    "/safe/%2e%2e//evil.example/path",
    "/safe%0d%0aSet-Cookie:bad=1",
    "%2F%2Fevil.example/path",
    "%252F%252Fevil.example/path",
  ])("falls back for an unsafe return target %s", input => {
    expect(safeInternalReturnTo(input)).toBe("/anna");
  });

  it("defaults unknown login roles to buyer", () => {
    expect(parseLoginRole("creator")).toBe("creator");
    expect(parseLoginRole("buyer")).toBe("buyer");
    expect(parseLoginRole("admin")).toBe("buyer");
    expect(parseLoginRole(undefined)).toBe("buyer");
  });

  it("carries the explicit verified-user role in both auth payloads", () => {
    expect(authPayload("author@example.com", "en", "creator")).toEqual({ email: "author@example.com", locale: "en", role: "creator" });
    expect(authVerificationPayload("author@example.com", "123456", "creator")).toEqual({ email: "author@example.com", token: "123456", role: "creator" });
  });
});
