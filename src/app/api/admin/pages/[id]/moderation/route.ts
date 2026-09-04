import { moderateAdminPage, moderationInput } from "@/lib/server/admin";
import { body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(request, async () => json(await moderateAdminPage((await context.params).id, moderationInput.parse(await body(request)))), true);
}
