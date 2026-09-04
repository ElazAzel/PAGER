import "server-only";
import type { Capabilities, Page } from "../types";
import { isDemoMode } from "./demo";
import { ApiError } from "./http";

/** Server-owned flags; never accept capability claims from a request body. */
export function getCapabilities(): Capabilities {
  const demo = isDemoMode();
  const pilot = process.env.PAGER_PILOT_MODE === "true";
  return {
    demo, pilot,
    payments: !pilot && (process.env.PAGER_PAYMENTS_ENABLED !== "false"),
    creatorSignup: !pilot,
    calOAuth: !!(process.env.CAL_OAUTH_CLIENT_ID && process.env.CAL_OAUTH_CLIENT_SECRET),
  };
}

export function assertPaymentsEnabled(): void {
  if (!getCapabilities().payments) throw new ApiError(403, "Online payments are unavailable in this pilot / Онлайн-оплата в пилоте недоступна");
}

export function isPageAvailable(page: Page): boolean { return page.moderation?.status !== "blocked"; }
export function assertPageAvailable(page: Page): void {
  if (!isPageAvailable(page)) throw new ApiError(404, "Page unavailable / Страница недоступна");
}
