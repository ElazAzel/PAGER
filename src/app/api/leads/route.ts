import { z } from "zod";
import { currentUser } from "@/lib/server/auth";
import { canAccessBlock } from "@/lib/server/access";
import { upsertContact, createOpportunity, addTimeline } from "@/lib/server/crm";
import { isDemoMode, mutateState } from "@/lib/server/store";
import { ApiError, body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
import { emailSchema, idSchema } from "@/lib/server/validation";
import { rateLimit, requestKey } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => {
  const input = z.object({ pageId: idSchema, blockId: idSchema, name: z.string().trim().min(1).max(200), email: emailSchema, message: z.string().max(5000).default("") }).strict().parse(await body(request));
  const user = await currentUser();
  await rateLimit(`lead:page:${input.pageId}`, 100, 3600_000); await rateLimit(`lead:ip:${requestKey(request)}`, 15, 3600_000); await rateLimit(`lead:email:${input.pageId}:${input.email}`, 5, 3600_000);
  await mutateState(state => {
    const page = state.publishedPages.find(p => p.id === input.pageId && p.publishedAt); const block = page?.blocks.find(b => b.id === input.blockId && ["form", "event"].includes(b.type) && !b.hidden && !b.archived);
    if (!page || !block || !canAccessBlock(page, block, user?.id, state.entitlements)) throw new ApiError(403, "Form access denied");
    if (block.type === "event" && state.items.some(i => i.ownerId === page.ownerId && i.pageId === page.id && i.kind === "ticket" && block.data.itemIds?.includes(i.id))) throw new ApiError(409, "This event requires a ticket purchase");
    const contact = upsertContact(state, page.ownerId, input.email, input.name);
    if (block.type === "event") {
      const registrations = state.opportunities.filter(o => o.ownerId === page.ownerId && o.pageId === page.id && (o as typeof o & { blockId?: string }).blockId === block.id && o.status !== "closed");
      if (registrations.some(o => o.contactId === contact.id)) return;
      if (block.data.capacity !== undefined && registrations.length >= block.data.capacity) throw new ApiError(409, "Event is full / Мест больше нет");
      if (block.data.endsAt && Date.parse(block.data.endsAt) <= Date.now()) throw new ApiError(409, "Registration has ended");
    }
    const op = createOpportunity(state, { ownerId: page.ownerId, pageId: page.id, contactId: contact.id, blockId: block.id, source: "form", message: input.message, test: isDemoMode() || user?.id === page.ownerId });
    addTimeline(state, { ownerId: page.ownerId, contactId: contact.id, kind: block.type === "event" ? "event_registration" : "form", title: block.type === "event" ? "Регистрация на событие / Event registration" : "Новый запрос / New enquiry", referenceId: op.id });
  }); return json({ ok: true });
}, true); }
