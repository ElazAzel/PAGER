import { currentUser } from "@/lib/server/auth";
import { projectPublicPage, publicItems } from "@/lib/server/access";
import { isDemoMode, readState } from "@/lib/server/store";
import { ApiError, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) { return route(request, async () => {
  const { slug } = await context.params; const user = await currentUser(); const state = await readState();
  const page = state.publishedPages.find(p => p.slug === slug && p.publishedAt); if (!page) throw new ApiError(404, "Page not found");
  return json({ page: projectPublicPage(state, page, user?.id, isDemoMode()), items: publicItems(state, page, user?.id) });
}); }
