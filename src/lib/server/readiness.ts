import "server-only";
import type { RuntimeReadiness } from "../types";

type Environment = Readonly<Record<string, string | undefined>>;
const present = (env: Environment, ...names: string[]) => names.every(name => Boolean(env[name]?.trim()));

function trustedOrigin(value: string | undefined, demo: boolean): boolean {
  try {
    const url = new URL(value ?? "");
    return !url.username && !url.password && (url.protocol === "https:" || (demo && ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())));
  } catch {
    return false;
  }
}

export function runtimeReadiness(env: Environment = process.env): RuntimeReadiness {
  const demo = env.PAGER_DEMO === "true";
  const pilot = !demo && env.PAGER_PILOT_MODE === "true";
  const mode = demo ? "demo" : pilot ? "pilot" : "real";
  if (demo) {
    return {
      mode, ready: trustedOrigin(env.PAGER_APP_URL, true),
      checks: {
        core: { configured: true, status: "demo" },
        stripe: { configured: false, status: "disabled" },
        cal: { configured: false, status: "disabled" },
        notifications: { configured: false, status: "disabled" },
        telegram: { configured: false, status: "disabled" },
      },
    };
  }
  const core = trustedOrigin(env.PAGER_APP_URL, false) && present(env, "DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PAGER_INTEGRATION_KEY");
  const stripe = present(env, "STRIPE_SECRET_KEY", "STRIPE_CONNECT_CLIENT_ID", "STRIPE_WEBHOOK_SECRET");
  const cal = present(env, "CAL_OAUTH_CLIENT_ID", "CAL_OAUTH_CLIENT_SECRET");
  const notifications = env.PAGER_NOTIFICATIONS_ENABLED === "true" && present(env, "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "RESEND_API_KEY", "RESEND_FROM");
  const telegram = env.PAGER_TELEGRAM_ENABLED === "true" && present(env, "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET");
  return {
    mode, ready: core,
    checks: {
      core: { configured: core, status: core ? "ready" : "missing" },
      stripe: { configured: stripe, status: stripe ? "ready" : "disabled" },
      cal: { configured: cal, status: cal ? "ready" : "disabled" },
      notifications: { configured: notifications, status: notifications ? "ready" : "disabled" },
      telegram: { configured: telegram, status: telegram ? "ready" : "disabled" },
    },
  };
}
