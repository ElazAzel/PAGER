import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { mutateState } from "@/lib/server/store";
import { ApiError, body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return route(request, async () => {
  const user = await requireUser(); const { id } = await context.params; const { notes } = z.object({ notes: z.string().max(20_000) }).strict().parse(await body(request));
  const contact = await mutateState(state => { const contact = state.contacts.find(c => c.id === id && c.ownerId === user.id); if (!contact) throw new ApiError(404, "Contact not found"); contact.notes = notes; contact.updatedAt = new Date().toISOString(); return contact; }); return json({ contact });
}, true); }
