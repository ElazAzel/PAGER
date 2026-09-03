import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { saveItem } from "@/lib/server/catalog";
import { mutateState } from "@/lib/server/store";
import { body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
import { itemSchema } from "@/lib/server/validation";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => { const user = await requireUser(); const input = z.object({ item: itemSchema }).strict().parse(await body(request)); return json({ item: await mutateState(state => saveItem(state, user.id, input.item)) }); }, true); }
