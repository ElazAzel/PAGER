import { currentUser } from "@/lib/server/auth";
import { isDemoMode } from "@/lib/server/store";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return route(request, async () => json({ user: await currentUser(), demo: isDemoMode() })); }
