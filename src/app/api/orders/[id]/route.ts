import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { fulfillOrder } from "@/lib/server/catalog";
import { mutateState } from "@/lib/server/store";
import { body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return route(request, async () => { const user = await requireUser(); const { id } = await context.params; const input = z.object({ fulfillment: z.enum(["unfulfilled", "processing", "shipped", "delivered"]), tracking: z.string().max(500).optional() }).strict().parse(await body(request)); return json({ order: await mutateState(state => fulfillOrder(state, user.id, id, input.fulfillment, input.tracking)) }); }, true); }
