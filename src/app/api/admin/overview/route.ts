import { adminPeriod, loadAdminOverview } from "@/lib/server/admin";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return route(request, async () => {
    const overview = await loadAdminOverview(adminPeriod(new URL(request.url).searchParams.get("days")));
    const response = json(overview);
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  });
}
