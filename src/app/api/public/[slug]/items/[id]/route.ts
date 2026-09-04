import { currentUser } from "@/lib/server/auth";
import { canAccessItem, projectItem, projectPublicPage } from "@/lib/server/access";
import { isDemoMode, readState } from "@/lib/server/store";
import { ApiError, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ slug: string; id: string }> }) { return route(request, async () => {
  const { slug, id } = await context.params; const user = await currentUser(); const state = await readState();
  const page = state.publishedPages.find(p => (p.slug === slug || p.slugAliases?.includes(slug)) && p.publishedAt); const item = state.items.find(i => i.id === id && i.pageId === page?.id && i.ownerId === page.ownerId);
  if (!page || !item) throw new ApiError(404, "Item not found");
  if (page.slug !== slug) return Response.redirect(new URL(`/${encodeURIComponent(page.slug)}/items/${encodeURIComponent(id)}${new URL(request.url).search}`, request.url), 308);
  const blockId = new URL(request.url).searchParams.get("blockId");
  if (!blockId || !canAccessItem(state, item, user?.id, blockId)) throw new ApiError(403, "Originating block access required");
  return json({ item: projectItem(state, item, user?.id), page: projectPublicPage(state, page, user?.id, isDemoMode()), blockId });
}); }
