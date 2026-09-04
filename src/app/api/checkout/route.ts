import { checkout, checkoutSchema } from "@/lib/integrations/checkout";
import { authenticated, body, demoFields, response, route } from "@/lib/integrations/runtime";
import { assertPaymentsEnabled } from "@/lib/server/capabilities";
export const runtime = "nodejs";
export const POST = (request: Request) => route(async () => {
  const user = await authenticated(request); const input = await body(request, checkoutSchema);
  assertPaymentsEnabled();
  return response({ ...await checkout(user, input), ...demoFields() });
});
