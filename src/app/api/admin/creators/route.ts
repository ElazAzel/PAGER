import { adminListQuery, loadAdminCreators } from "@/lib/server/admin";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return route(request, async () => json(await loadAdminCreators(adminListQuery(new URL(request.url).searchParams))));
}
