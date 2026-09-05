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
  PAGER_OPERATOR_NAME: "PAGER Labs",
  PAGER_SUPPORT_EMAIL: "support@pager.test",
};

describe("runtime readiness", () => {
  it("requires core real-mode configuration without exposing secret values", () => {
    const result = runtimeReadiness({ ...base, STRIPE_SECRET_KEY: "", PAGER_PILOT_MODE: "true" });
    expect(result.mode).toBe("pilot");
    expect(result.ready).toBe(true);
    expect(result.checks.core.configured).toBe(true);
    expect(result.checks.legal.configured).toBe(true);
    expect(result.checks.stripe.configured).toBe(false);
    expect(result.checks.stripe.status).toBe("disabled");
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

  it("degrades when payments are enabled without complete Stripe configuration", () => {
    const result = runtimeReadiness({ ...base, PAGER_PAYMENTS_ENABLED: "true", STRIPE_SECRET_KEY: "stripe-secret" });
    expect(result.mode).toBe("real");
    expect(result.ready).toBe(false);
    expect(result.checks.stripe).toEqual({ configured: false, status: "missing" });
  });

  it("accepts enabled payments only with the complete Stripe runtime contract", () => {
    const result = runtimeReadiness({ ...base, PAGER_PAYMENTS_ENABLED: "true", STRIPE_SECRET_KEY: "stripe-secret", STRIPE_CONNECT_CLIENT_ID: "ca_test", STRIPE_WEBHOOK_SECRET: "whsec_test" });
    expect(result.ready).toBe(true);
    expect(result.checks.stripe).toEqual({ configured: true, status: "ready" });
  });

  it("treats missing legal identity and incomplete enabled providers as release blockers", () => {
    const legal = runtimeReadiness({ ...base, PAGER_OPERATOR_NAME: "", PAGER_SUPPORT_EMAIL: "support@example.invalid" });
    expect(legal.ready).toBe(false);
    expect(legal.checks.legal.status).toBe("missing");
    const notifications = runtimeReadiness({ ...base, PAGER_NOTIFICATIONS_ENABLED: "true", RESEND_API_KEY: "partial" });
    expect(notifications.ready).toBe(false);
    expect(notifications.checks.notifications.status).toBe("missing");
  });
});
