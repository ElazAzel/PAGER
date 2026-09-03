import { creator, response, route } from "@/lib/integrations/runtime";
import { mutateState, readState } from "@/lib/server/store";
import { stripeClient } from "@/lib/integrations/stripe";
export const runtime = "nodejs";
export const POST = (request: Request) => route(async () => {
  const user = await creator(request); const integration = (await readState()).integrations.find(i => i.ownerId === user.id);
  if (!integration?.stripeAccountId) return response({ connected: false, ready: false });
  const account = await stripeClient().accounts.retrieve(integration.stripeAccountId); const ready = Boolean(account.charges_enabled && account.payouts_enabled);
  await mutateState(s => { const current = s.integrations.find(i => i.ownerId === user.id)!; if (current.stripeAccountId === account.id) current.stripeReady = ready; });
  return response({ connected: true, ready });
});
