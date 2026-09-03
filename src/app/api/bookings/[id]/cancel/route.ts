import { authenticated, demoFields, response, route } from "@/lib/integrations/runtime";
import { changeBooking } from "@/lib/integrations/booking-actions";
export const runtime = "nodejs";
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await authenticated(request); const { id } = await context.params;
  return response({ ...await changeBooking(id, user, { action: "cancel" }), ...demoFields() });
});
