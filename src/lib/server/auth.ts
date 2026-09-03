import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "../types";
import { ApiError } from "./http";
import { isDemoMode, mutateState, readState } from "./store";
import { guardDemoContext } from "./demo";
import { DEMO_COOKIE, demoSecret, verifyDemoSession } from "./demo-session";
import { starterPage } from "./seed";
import { reconcileVerifiedBookings } from "./identity";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.PAGER_APP_URL || request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Same-origin request required");
}
export async function supabaseAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new ApiError(503, "Supabase authentication is not configured");
  const jar = await cookies();
  return createServerClient(url, key, { cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }, cookies: { getAll: () => jar.getAll(), setAll(values) { for (const { name, value, options } of values) { try { jar.set(name, value, options); } catch { /* Server components cannot refresh response cookies; API/session can. */ } } } } });
}
export async function currentUser(): Promise<User | null> {
  if (isDemoMode()) {
    await guardDemoContext(); const jar = await cookies(); const token = jar.get(DEMO_COOKIE)?.value;
    if (!token) return null;
    const id = verifyDemoSession(token, await demoSecret()); if (!id) return null;
    return (await readState()).users.find(u => u.id === id) ?? null;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const client = await supabaseAuth(); const { data, error } = await client.auth.getUser();
  if (error || !data.user || !data.user.email || !data.user.email_confirmed_at) return null;
  const verified = data.user;
  return mutateState(state => {
    const existing = state.users.find(u => u.id === verified.id);
    if (existing) { existing.email = verified.email!.trim().toLowerCase(); reconcileVerifiedBookings(state, existing); return existing; }
    const user: User = { id: verified.id, email: verified.email!.trim().toLowerCase(), name: typeof verified.user_metadata?.name === "string" ? verified.user_metadata.name.slice(0, 200) : verified.email!.split("@")[0], locale: verified.user_metadata?.locale === "en" ? "en" : "ru", role: verified.user_metadata?.role === "creator" ? "creator" : "buyer", createdAt: new Date().toISOString() };
    state.users.push(user); if (user.role === "creator") state.pages.push(starterPage(user)); reconcileVerifiedBookings(state, user); return user;
  });
}
export async function requireUser(): Promise<User> { const user = await currentUser(); if (!user) throw new ApiError(401, "Sign in required / Войдите в аккаунт"); return user; }
