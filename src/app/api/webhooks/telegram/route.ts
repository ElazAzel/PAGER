import { rawBody, response, route } from "@/lib/integrations/runtime";
import { applyTelegramUpdate, verifyTelegramWebhook } from "@/lib/integrations/telegram";
import { IntegrationError } from "@/lib/integrations/security";
import { mutateState } from "@/lib/server/store";
export const runtime = "nodejs";
export const POST = (request: Request) => route(async () => {
  if (!verifyTelegramWebhook(request.headers.get("x-telegram-bot-api-secret-token"))) throw new IntegrationError(401, "Invalid Telegram webhook secret");
  const raw = await rawBody(request, 32768);
  let update: unknown;
  try { update = JSON.parse(raw); } catch { throw new IntegrationError(400, "Invalid webhook JSON"); }
  await mutateState(state => applyTelegramUpdate(state, update));
  // Invalid/expired/replayed tokens are acknowledged without revealing recipient information.
  return response({ received: true });
});
