import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
const createClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/ssr", () => ({ createServerClient: createClient }));
import { proxy } from "../src/proxy";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Supabase SSR refresh boundary", () => {
  it("does not contact Auth for anonymous or local demo requests", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    await proxy(new NextRequest("https://pager.example/anna"));
    vi.stubEnv("PAGER_DEMO", "true");
    await proxy(new NextRequest("http://127.0.0.1:3000/anna", { headers: { cookie: "sb-project-auth-token=old" } }));
    expect(createClient).not.toHaveBeenCalled();
  });
  it("forwards refreshed cookies to both the render request and browser and disables shared caching", async () => {
    vi.stubEnv("PAGER_DEMO", "false");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    createClient.mockImplementation((_url: string, _key: string, options: { cookieOptions: CookieOptions; cookies: { setAll: (values: Array<{ name: string; value: string; options: CookieOptions }>) => void } }) => {
      auth.getUser.mockImplementation(async () => {
        options.cookies.setAll([{ name: "sb-project-auth-token", value: "refreshed", options: options.cookieOptions }]);
        return { data: { user: null }, error: null };
      });
      return { auth };
    });
    const response = await proxy(new NextRequest("https://pager.example/purchases", { headers: { cookie: "sb-project-auth-token=expired" } }));
    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-project-auth-token=refreshed");
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
