import type { Locale } from "./types";

export type LoginRole = "creator" | "buyer";

const INTERNAL_ORIGIN = "https://pager.invalid";
const encodedPathSeparator = /%(?:2f|5c)/i;
const encodedControl = /%(?:0[0-9a-f]|7f)/i;
const literalControl = /[\u0000-\u001f\u007f]/;

/**
 * Converts an untrusted login return target into a canonical local path.
 * Query parsing already decodes one layer, so this function deliberately does
 * not recursively decode attacker input.
 */
export function safeInternalReturnTo(value: string | null | undefined, fallback = "/anna"): string {
  if (!value || value.length > 2048 || value !== value.trim() || literalControl.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  const rawPath = value.split(/[?#]/, 1)[0];
  if (encodedPathSeparator.test(rawPath) || encodedControl.test(value)) return fallback;
  try {
    const url = new URL(value, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN || !url.pathname.startsWith("/") || url.pathname.startsWith("//")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function parseLoginRole(value: string | string[] | null | undefined): LoginRole {
  return value === "creator" ? "creator" : "buyer";
}

export function postLoginDestination(role: LoginRole, returnTo: string): string {
  if (role === "creator") return "/dashboard";
  const destination = safeInternalReturnTo(returnTo);
  return /^\/dashboard(?:\/|[?#]|$)/.test(destination) ? "/anna" : destination;
}

export function authPayload(email: string, locale: Locale, role: LoginRole) {
  return { email, locale, role } as const;
}

export function authVerificationPayload(email: string, token: string, role: LoginRole) {
  return { email, token, role } as const;
}
