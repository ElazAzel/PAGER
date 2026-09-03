import { z } from "zod";
import { currentUser } from "@/lib/server/auth";
import { recordAnalytics } from "@/lib/server/metrics";
import { isDemoMode, mutateState } from "@/lib/server/store";
import { body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
import { idSchema } from "@/lib/server/validation";
import { rateLimit, requestKey } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => {
  const input = z.object({ pageId: idSchema, kind: z.enum(["view", "click"]), visitorId: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/), blockId: idSchema.optional() }).strict().parse(await body(request));
  const user = await currentUser(); await rateLimit(`analytics:${requestKey(request)}`, 300, 60_000); await rateLimit(`analytics:page:${input.pageId}`, 3000, 60_000);
  await mutateState(state => recordAnalytics(state, input, user?.id, isDemoMode())); return json({ ok: true });
}, true); }
