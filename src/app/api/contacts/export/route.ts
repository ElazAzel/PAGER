import { requireUser } from "@/lib/server/auth";
import { contactsCsv } from "@/lib/server/crm";
import { readState } from "@/lib/server/store";
import { route } from "@/lib/server/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return route(request, async () => { const user = await requireUser(); const state = await readState(); return new Response(contactsCsv(state.contacts.filter(c => c.ownerId === user.id)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="pager-contacts.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" } }); }); }
