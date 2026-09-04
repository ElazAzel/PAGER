import { z } from "zod";
import { currentUser } from "@/lib/server/auth";
import { analyticsRequestExcluded, recordAnalytics } from "@/lib/server/metrics";
import { isDemoMode, mutateState } from "@/lib/server/store";
import { body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
import { idSchema } from "@/lib/server/validation";
import { rateLimit, requestKey } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => {
  const token = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/);
  const input = z.object({ pageId: idSchema, kind: z.enum(["view", "click"]), visitorId: token, eventId: token.optional(), blockId: idSchema.optional(), action: z.enum(["page_access", "block_access", "form_open", "form_submit", "booking_start", "booking_confirmed"]).optional(), source: z.enum(["direct", "search", "social", "ai", "referral", "unknown"]).optional(), device: z.enum(["mobile", "tablet", "desktop", "unknown"]).optional() }).strict().parse(await body(request));
  if (analyticsRequestExcluded(request)) return json({ ok: true });
  const user = await currentUser(); await rateLimit(`analytics:${requestKey(request)}`, 300, 60_000); await rateLimit(`analytics:page:${input.pageId}`, 3000, 60_000);
  await mutateState(state => recordAnalytics(state, input, user?.id, isDemoMode())); return json({ ok: true });
}, true); }
