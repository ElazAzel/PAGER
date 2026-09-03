import { calConfigSchema, saveCalApiKey, ensureCalWebhook, validateCalLink } from "@/lib/integrations/cal";
import { body, creator, integrationFor, response, route } from "@/lib/integrations/runtime";
import { mutateState, readState, isDemoMode } from "@/lib/server/store";
import { IntegrationError } from "@/lib/integrations/security";
import type { CommerceIntegration } from "@/lib/integrations/model";
export const runtime = "nodejs";
export const POST = (request: Request) => route(async () => {
  const user = await creator(request); if (isDemoMode()) throw new IntegrationError(409, "Real Cal credentials cannot be saved in local demo mode");
  const input = await body(request, calConfigSchema); const calLink = input.calLink ? validateCalLink(input.calLink) : undefined;
  if (input.apiKey) await saveCalApiKey(user.id, input.apiKey);
  if (calLink) await mutateState(s => { integrationFor(s, user.id).calLink = calLink; });
  await ensureCalWebhook(user.id);
  const integration = (await readState()).integrations.find(i => i.ownerId === user.id) as CommerceIntegration;
  return response({ connected: Boolean(integration?.commerce?.calWebhookReady), calLink: integration?.calLink ?? "" });
});
