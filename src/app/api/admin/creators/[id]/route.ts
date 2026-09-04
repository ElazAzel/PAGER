import { loadAdminCreator } from "@/lib/server/admin";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(request, async () => json(await loadAdminCreator((await context.params).id)));
}
