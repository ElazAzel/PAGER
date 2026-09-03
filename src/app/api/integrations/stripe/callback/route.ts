import { creator, appOrigin, integrationFor, route } from "@/lib/integrations/runtime";
import { consumeOAuthState, IntegrationError } from "@/lib/integrations/security";
import { mutateState } from "@/lib/server/store";
import { stripeClient } from "@/lib/integrations/stripe";
export const runtime = "nodejs";
export const GET = (request: Request) => route(async () => {
  const user = await creator(request, false); const url = new URL(request.url); const code = url.searchParams.get("code");
  await mutateState(s => consumeOAuthState(integrationFor(s, user.id).commerce?.oauth?.stripe, url.searchParams.get("state") ?? "", user.id, "stripe"));
  if (!code || url.searchParams.has("error")) throw new IntegrationError(400, "Stripe connection was not authorized; restart Connect");
  const client = stripeClient(); const token = await client.oauth.token({ grant_type: "authorization_code", code });
  if (!token.stripe_user_id || token.livemode !== (process.env.PAGER_STRIPE_LIVE === "true")) throw new IntegrationError(400, "Stripe connection mode mismatch");
  const account = await client.accounts.retrieve(token.stripe_user_id);
  await mutateState(state => {
    if (state.integrations.some(i => i.ownerId !== user.id && i.stripeAccountId === account.id)) throw new IntegrationError(409, "Stripe account already belongs to another creator");
    const integration = integrationFor(state, user.id);
    if (integration.stripeAccountId && integration.stripeAccountId !== account.id && state.orders.some(o => o.ownerId === user.id)) throw new IntegrationError(409, "Account switching requires settlement of existing commerce records");
    integration.stripeAccountId = account.id; integration.stripeReady = Boolean(account.charges_enabled && account.payouts_enabled); integration.updatedAt = new Date().toISOString();
  });
  return Response.redirect(`${appOrigin()}/dashboard?stripe=connected`, 303);
});
