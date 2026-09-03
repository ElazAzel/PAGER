import { requireUser } from "@/lib/server/auth";
import { boundedMultipart, uploadAsset } from "@/lib/server/assets";
import { ApiError, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
import { idSchema } from "@/lib/server/validation";
import { rateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => { const user = await requireUser(); await rateLimit(`upload:${user.id}`, 30, 3600_000); const form = await boundedMultipart(request); const pageId = idSchema.parse(form.get("pageId")); const file = form.get("file"); if (!(file instanceof File)) throw new ApiError(400, "File required"); return json(await uploadAsset(user, pageId, file)); }, true); }
