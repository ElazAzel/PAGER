import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { mutateState } from "@/lib/server/store";
import { route } from "@/lib/server/routes";
import { ApiError, body, json } from "@/lib/server/http";
import { addTimeline } from "@/lib/server/crm";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return route(request, async () => {
  const user = await requireUser(); const { id } = await context.params;
  const input = z.object({ status: z.enum(["new", "closed"]) }).strict().parse(await body(request));
  return json({ opportunity: await mutateState(state => {
    const opportunity = state.opportunities.find(entry => entry.id === id && entry.ownerId === user.id);
    if (!opportunity) throw new ApiError(404, "Opportunity not found");
    opportunity.status = input.status;
    addTimeline(state, { ownerId: user.id, contactId: opportunity.contactId, kind: "opportunity_status", title: input.status === "closed" ? "Запрос закрыт / Enquiry closed" : "Запрос открыт / Enquiry reopened" });
    return opportunity;
  }) });
}, true); }
