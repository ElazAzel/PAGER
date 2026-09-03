import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { savePage } from "@/lib/server/pages";
import { mutateState } from "@/lib/server/store";
import { body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
import { pageSchema } from "@/lib/server/validation";
export const runtime = "nodejs";
export async function PUT(request: Request) { return route(request, async () => { const user = await requireUser(); const input = z.object({ page: pageSchema }).strict().parse(await body(request)); return json({ page: await mutateState(state => savePage(state, user.id, input.page)) }); }, true); }
