import { handleStripeEvent, verifyStripeWebhook } from "@/lib/integrations/stripe";
import { env, rawBody, response, route } from "@/lib/integrations/runtime";
export const runtime = "nodejs";
export const POST = (request: Request) => route(async () => {
  const event = verifyStripeWebhook(await rawBody(request), request.headers.get("stripe-signature"), env("STRIPE_WEBHOOK_SECRET"), process.env.PAGER_STRIPE_LIVE === "true");
  return response(await handleStripeEvent(event));
});
