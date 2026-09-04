import { requireUser } from "@/lib/server/auth";
import { publishPage } from "@/lib/server/pages";
import { mutateState } from "@/lib/server/store";
import { body, json } from "@/lib/server/http";
import { z } from "zod";
import { route } from "@/lib/server/routes";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => { const user = await requireUser(); const input = request.headers.get("content-type")?.includes("application/json") ? z.object({ expectedRevision: z.number().int().positive().optional() }).strict().parse(await body(request)) : {}; const page = await mutateState(state => publishPage(state, user.id, input.expectedRevision)); return json({ page, url: `/${page.slug}` }); }, true); }
