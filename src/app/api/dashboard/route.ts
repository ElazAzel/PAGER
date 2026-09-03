import { requireUser } from "@/lib/server/auth";
import { dashboardData } from "@/lib/server/metrics";
import { isDemoMode, readState } from "@/lib/server/store";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return route(request, async () => { const user = await requireUser(); return json(dashboardData(await readState(), user, isDemoMode())); }); }
