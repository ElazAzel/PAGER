import "server-only";
import { legalConfig } from "../legal";
import { isLoopback, secretKey } from "../integrations/security";
import type { RuntimeReadiness } from "../types";

type Environment = Readonly<Record<string, string | undefined>>;
const present = (env: Environment, ...names: string[]) => names.every(name => Boolean(env[name]?.trim()));

function trustedOrigin(value: string | undefined, demo: boolean): boolean {
  try {
    const url = new URL(value ?? "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
    return demo
      ? isLoopback(url.hostname) && ["http:", "https:"].includes(url.protocol)
      : !isLoopback(url.hostname) && url.protocol === "https:";
  } catch {
    return false;
  }
}

function usableIntegrationKey(env: Environment): boolean {
  try { secretKey(env.PAGER_INTEGRATION_KEY ?? ""); return true; }
  catch { return false; }
}

export function runtimeReadiness(env: Environment = process.env): RuntimeReadiness {
  const demo = env.PAGER_DEMO === "true";
  const pilot = !demo && env.PAGER_PILOT_MODE === "true";
  const mode = demo ? "demo" : pilot ? "pilot" : "real";
  if (demo) {
    const core = trustedOrigin(env.PAGER_APP_URL, true);
    return {
      mode, ready: core,
      checks: {
        core: { configured: core, status: "demo" },
        legal: { configured: true, status: "demo" },
        stripe: { configured: false, status: "disabled" },
        cal: { configured: false, status: "disabled" },
        notifications: { configured: false, status: "disabled" },
        telegram: { configured: false, status: "disabled" },
      },
    };
  }
  const core = trustedOrigin(env.PAGER_APP_URL, false) && present(env, "DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY") && usableIntegrationKey(env);
  const legal = legalConfig(env).configured;
  const paymentsEnabled = !pilot && env.PAGER_PAYMENTS_ENABLED === "true";
  const stripeConfigured = present(env, "STRIPE_SECRET_KEY", "STRIPE_CONNECT_CLIENT_ID", "STRIPE_WEBHOOK_SECRET");
  const stripeReady = !paymentsEnabled || stripeConfigured;

  const calConfigured = present(env, "CAL_OAUTH_CLIENT_ID", "CAL_OAUTH_CLIENT_SECRET");
  const calPartiallyConfigured = Boolean(env.CAL_OAUTH_CLIENT_ID?.trim() || env.CAL_OAUTH_CLIENT_SECRET?.trim());
  const calReady = !calPartiallyConfigured || calConfigured;

  const notificationsEnabled = env.PAGER_NOTIFICATIONS_ENABLED === "true";
  const notificationsConfigured = present(env, "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "RESEND_API_KEY", "RESEND_FROM");
  const notificationsReady = !notificationsEnabled || notificationsConfigured;

  const telegramEnabled = env.PAGER_TELEGRAM_ENABLED === "true";
  const telegramConfigured = present(env, "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET");
  const telegramReady = !telegramEnabled || telegramConfigured;

  return {
    mode, ready: core && legal && stripeReady && calReady && notificationsReady && telegramReady,
    checks: {
      core: { configured: core, status: core ? "ready" : "missing" },
      legal: { configured: legal, status: legal ? "ready" : "missing" },
      stripe: {
        configured: paymentsEnabled && stripeConfigured,
        status: paymentsEnabled ? (stripeConfigured ? "ready" : "missing") : "disabled",
      },
      cal: {
        configured: calConfigured,
        status: calConfigured ? "ready" : calPartiallyConfigured ? "missing" : "disabled",
      },
      notifications: {
        configured: notificationsEnabled && notificationsConfigured,
        status: notificationsEnabled ? (notificationsConfigured ? "ready" : "missing") : "disabled",
      },
      telegram: {
        configured: telegramEnabled && telegramConfigured,
        status: telegramEnabled ? (telegramConfigured ? "ready" : "missing") : "disabled",
      },
    },
  };
}
