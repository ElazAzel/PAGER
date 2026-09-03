import { currentUser } from "@/lib/server/auth";
import { assetResponse } from "@/lib/server/assets";
import { route } from "@/lib/server/routes";
import { idSchema } from "@/lib/server/validation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return route(request, async () => { const user = await currentUser(); const { id } = await context.params; return assetResponse(idSchema.parse(id), user?.id); }); }
