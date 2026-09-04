import { bookingSlotQuery, getBookingSlots } from "@/lib/integrations/booking-slots";
import { response, route } from "@/lib/integrations/runtime";
import { assertDemoRequest } from "@/lib/integrations/security";
import { currentUser } from "@/lib/server/auth";
import { isDemoMode } from "@/lib/server/store";
import { rateLimit, requestKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const GET = (request: Request, context: { params: Promise<{ slug: string }> }) => route(async () => {
  if (isDemoMode()) assertDemoRequest(request, true);
  const { slug } = await context.params;
  const input = bookingSlotQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  await rateLimit(`booking-slots:${requestKey(request)}`, 60, 60_000);
  await rateLimit(`booking-slots-page:${slug}`, 180, 60_000);
  return response(await getBookingSlots(slug, input, await currentUser()));
});
