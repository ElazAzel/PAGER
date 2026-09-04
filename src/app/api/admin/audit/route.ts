import { adminListQuery, loadAdminAudit } from "@/lib/server/admin";
import { json, ApiError } from "@/lib/server/http";
import { route } from "@/lib/server/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return route(request, async () => {
    const params = new URL(request.url).searchParams;
    const pageId = params.get("pageId") ?? undefined;
    if (pageId && pageId.length > 128) throw new ApiError(400, "Invalid page ID / Некорректный ID страницы");
    return json(await loadAdminAudit(adminListQuery(params), pageId));
  });
}
