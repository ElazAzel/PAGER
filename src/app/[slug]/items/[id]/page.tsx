import { ItemDetailScreen } from "../../../ui/public-page";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { anonymousItem, itemMetadata, NO_INDEX, readPublishedSnapshot } from "@/lib/server/seo";
import { currentUser } from "@/lib/server/auth";
import { canAccessItem } from "@/lib/server/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ blockId?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const search = await searchParams;
  if (Array.isArray(search.blockId)) return { title: "PAGER", robots: NO_INDEX };
  const snapshot = await readPublishedSnapshot(slug);
  return snapshot ? itemMetadata(snapshot.state, snapshot.sourcePage, id, snapshot.page.demo, typeof search.blockId === "string" ? search.blockId : undefined) : { title: "PAGER", robots: NO_INDEX };
}

export default async function PublicItem({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const search = await searchParams;
  if (Array.isArray(search.blockId)) notFound();
  const selected = typeof search.blockId === "string" ? search.blockId : undefined;
  const snapshot = await readPublishedSnapshot(slug);
  if (!snapshot) notFound();
  if (snapshot.page.slug !== slug) permanentRedirect(`/${encodeURIComponent(snapshot.page.slug)}/items/${encodeURIComponent(id)}${selected ? `?blockId=${encodeURIComponent(selected)}` : ""}`);
  const visible = anonymousItem(snapshot.state, snapshot.sourcePage, id, selected);
  if (visible) return <ItemDetailScreen key={`${slug}:${id}:${visible.blockId}`} slug={slug} itemId={id} initialPage={snapshot.page} initialItem={visible.item} initialBlockId={visible.blockId} />;
  // Paid material is never embedded in HTML or RSC, even for a signed-in buyer.
  // Only a verified buyer/owner can receive the hydration shell for that origin.
  const item = snapshot.state.items.find(candidate => candidate.id === id && candidate.pageId === snapshot.page.id && candidate.ownerId === snapshot.sourcePage.ownerId);
  const user = item && selected ? await currentUser() : null;
  if (!item || !user || !selected || !canAccessItem(snapshot.state, item, user.id, selected)) notFound();
  return <ItemDetailScreen key={`${slug}:${id}:${selected}`} slug={slug} itemId={id} initialBlockId={selected} />;
}
