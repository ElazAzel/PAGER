import { creator, appOrigin, env, integrationFor, response, route } from "@/lib/integrations/runtime";
import { newOAuthState, IntegrationError } from "@/lib/integrations/security";
import { isDemoMode, mutateState } from "@/lib/server/store";
export const runtime = "nodejs";
export const POST = (request: Request) => route(async () => {
  const user = await creator(request); if (isDemoMode()) throw new IntegrationError(409, "Stripe Connect is disabled in local demo mode");
  const url = new URL("https://connect.stripe.com/oauth/authorize"); const pair = newOAuthState(user.id, "stripe");
  url.search = new URLSearchParams({ response_type: "code", client_id: env("STRIPE_CONNECT_CLIENT_ID"), scope: "read_write", redirect_uri: `${appOrigin()}/api/integrations/stripe/callback`, state: pair.state }).toString();
  await mutateState(s => { const integration = integrationFor(s, user.id); const meta = integration.commerce ??= {}; (meta.oauth ??= {}).stripe = pair.record; });
  return response({ url: url.toString() });
});
