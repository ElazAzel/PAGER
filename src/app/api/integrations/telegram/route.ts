import { z } from "zod";
import { authenticated, body, response, route } from "@/lib/integrations/runtime";
import { createTelegramPair, disconnectTelegram, telegramStatus } from "@/lib/integrations/telegram";
import { mutateState, readState } from "@/lib/server/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => route(async () => {
  const user = await authenticated(request, false);
  return response(telegramStatus(await readState(), user));
});
export const POST = (request: Request) => route(async () => {
  const user = await authenticated(request);
  await body(request, z.object({}).strict());
  return response(await mutateState(state => createTelegramPair(state, user)));
});
export const DELETE = (request: Request) => route(async () => {
  const user = await authenticated(request);
  await mutateState(state => disconnectTelegram(state, user));
  return response({ connected: false });
});
