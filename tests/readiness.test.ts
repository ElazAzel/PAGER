import { describe, expect, it } from "vitest";
import { runtimeReadiness } from "../src/lib/server/readiness";

const base = {
  PAGER_DEMO: "false",
  PAGER_APP_URL: "https://pager.example",
  DATABASE_URL: "postgres://db",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  PAGER_INTEGRATION_KEY: "a".repeat(44),
};

describe("runtime readiness", () => {
  it("requires core real-mode configuration without exposing secret values", () => {
    const result = runtimeReadiness({ ...base, STRIPE_SECRET_KEY: "", PAGER_PILOT_MODE: "true" });
    expect(result.mode).toBe("pilot");
    expect(result.ready).toBe(true);
    expect(result.checks.core.configured).toBe(true);
    expect(result.checks.stripe.configured).toBe(false);
    expect(JSON.stringify(result)).not.toContain("postgres://");
    expect(JSON.stringify(result)).not.toContain("service");
  });

  it("marks real mode degraded when the trusted origin or database is missing", () => {
    const result = runtimeReadiness({ PAGER_DEMO: "false", PAGER_APP_URL: "http://localhost:3000" });
    expect(result.mode).toBe("real");
    expect(result.ready).toBe(false);
    expect(result.checks.core.configured).toBe(false);
  });

  it("keeps demo explicitly runnable while reporting external providers as skipped", () => {
    const result = runtimeReadiness({ PAGER_DEMO: "true", PAGER_APP_URL: "http://127.0.0.1:3000" });
    expect(result.mode).toBe("demo");
    expect(result.ready).toBe(true);
    expect(result.checks.core.status).toBe("demo");
    expect(result.checks.stripe.status).toBe("disabled");
  });
});
