import { z } from "zod";
import { authenticated, body, demoFields, response, route } from "@/lib/integrations/runtime";
import { timezoneSchema } from "@/lib/integrations/bookings";
import { changeBooking } from "@/lib/integrations/booking-actions";
export const runtime = "nodejs";
export const PATCH = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await authenticated(request); const { id } = await context.params;
  const input = await body(request, z.object({ startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }), timezone: timezoneSchema }).strict());
  return response({ ...await changeBooking(id, user, { action: "reschedule", ...input }), ...demoFields() });
});
