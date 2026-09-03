import { appOrigin, creator, env, integrationFor, response, route } from "@/lib/integrations/runtime";
import { newOAuthState, IntegrationError } from "@/lib/integrations/security";
import { isDemoMode, mutateState } from "@/lib/server/store";
export const runtime = "nodejs";
export const POST = (request: Request) => route(async () => {
  const user = await creator(request); if (isDemoMode()) throw new IntegrationError(409, "Cal OAuth is disabled in local demo");
  const pair = newOAuthState(user.id, "cal"); const url = new URL("https://app.cal.com/auth/oauth2/authorize");
  url.search = new URLSearchParams({ client_id: env("CAL_OAUTH_CLIENT_ID"), redirect_uri: `${appOrigin()}/api/integrations/cal/callback`, state: pair.state, scope: "PROFILE_READ BOOKING_READ BOOKING_WRITE WEBHOOK_READ WEBHOOK_WRITE EVENT_TYPE_READ" }).toString();
  await mutateState(s => { const meta = integrationFor(s, user.id).commerce ??= {}; (meta.oauth ??= {}).cal = pair.record; });
  return response({ url: url.toString() });
});
