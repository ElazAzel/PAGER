import { appOrigin, creator, integrationFor, route } from "@/lib/integrations/runtime";
import { consumeOAuthState, IntegrationError } from "@/lib/integrations/security";
import { mutateState } from "@/lib/server/store";
import { exchangeCalCode, ensureCalWebhook } from "@/lib/integrations/cal";
export const runtime = "nodejs";
export const GET = (request: Request) => route(async () => {
  const user = await creator(request, false); const url = new URL(request.url);
  await mutateState(s => consumeOAuthState(integrationFor(s, user.id).commerce?.oauth?.cal, url.searchParams.get("state") ?? "", user.id, "cal"));
  const code = url.searchParams.get("code"); if (!code || url.searchParams.has("error")) throw new IntegrationError(400, "Cal authorization was not completed; restart OAuth");
  await exchangeCalCode(user.id, code); await ensureCalWebhook(user.id);
  return Response.redirect(`${appOrigin()}/dashboard?cal=connected`, 303);
});
