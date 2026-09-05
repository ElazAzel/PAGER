import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseState } from "../src/lib/types";
import { createDemoState } from "../src/lib/server/seed";
import { POST } from "../src/app/api/auth/verify/route";

const mocks = vi.hoisted(() => ({ state: {} as DatabaseState, verify: vi.fn(), getUser: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { verifyOtp: mocks.verify, getUser: mocks.getUser } }) }));
vi.mock("../src/lib/server/store", () => ({ isDemoMode: () => false, mutateState: async (fn: (state: DatabaseState) => unknown) => fn(mocks.state), readState: async () => mocks.state }));
vi.mock("../src/lib/server/rate-limit", () => ({ rateLimit: async () => {}, requestKey: () => "test" }));

beforeEach(() => {
  mocks.state = createDemoState(); mocks.state.users = []; mocks.state.pages = [];
  vi.stubEnv("PAGER_DEMO", "false"); vi.stubEnv("PAGER_PILOT_MODE", "false");
  vi.stubEnv("PAGER_APP_URL", "https://pager.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon");
  mocks.verify.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-author", email: "author@example.test", email_confirmed_at: "2026-09-01", user_metadata: { role: "creator", locale: "en" } } }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const verify = (role?: "creator" | "buyer") => POST(new Request("https://pager.test/api/auth/verify", { method: "POST", headers: { origin: "https://pager.test", "content-type": "application/json" }, body: JSON.stringify({ email: "author@example.test", token: "123456", ...(role ? { role } : {}) }) }));

describe("verified OTP enrollment compatibility", () => {
  it("preserves the metadata enrollment contract when older clients omit role", async () => {
    const response = await verify();
    expect(response.status).toBe(200);
    expect((await response.json()).user.role).toBe("creator");
    expect(mocks.state.pages).toHaveLength(1);
  });
  it("honors an explicit buyer intent without creating a creator page", async () => {
    expect((await (await verify("buyer")).json()).user.role).toBe("buyer");
    expect(mocks.state.pages).toHaveLength(0);
  });
  it("keeps explicit creator enrollment invite-gated in pilot mode", async () => {
    vi.stubEnv("PAGER_PILOT_MODE", "true"); vi.stubEnv("PAGER_CREATOR_INVITE_EMAILS", "");
    expect((await (await verify("creator")).json()).user.role).toBe("buyer");
    expect(mocks.state.pages).toHaveLength(0);
  });
  it("does not enroll an identity after failed OTP verification", async () => {
    mocks.verify.mockResolvedValue({ error: { message: "Expired" } });
    expect((await verify("creator")).status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled(); expect(mocks.state.users).toHaveLength(0);
  });
});
