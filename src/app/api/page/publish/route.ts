import { requireUser } from "@/lib/server/auth";
import { publishPage } from "@/lib/server/pages";
import { mutateState } from "@/lib/server/store";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => { const user = await requireUser(); const page = await mutateState(state => publishPage(state, user.id)); return json({ page, url: `/${page.slug}` }); }, true); }
