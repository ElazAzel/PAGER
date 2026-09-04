import { z } from "zod";
import type { AnalyticsDays } from "@/lib/types";
import { requireUser } from "@/lib/server/auth";
import { creatorAnalyticsReport } from "@/lib/server/metrics";
import { isDemoMode, readState } from "@/lib/server/store";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return route(request, async () => {
    const user = await requireUser();
    const query = z.object({ days: z.enum(["7", "30", "90"]).default("30") }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
    // Tenant identity always comes from the verified session; no caller-selected owner or page.
    return json({ report: creatorAnalyticsReport(await readState(), user, { days: Number(query.days) as AnalyticsDays, demo: isDemoMode() }) });
  });
}
