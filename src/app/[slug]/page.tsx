import { PublicPageScreen } from "../ui/public-page";
import { notFound, permanentRedirect } from "next/navigation";
import { NO_INDEX, pageDiscovery, readPublishedSnapshot, serializeJsonLd } from "@/lib/server/seo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await readPublishedSnapshot(slug);
  return snapshot ? pageDiscovery(snapshot.state, snapshot.sourcePage, snapshot.page.demo).metadata : { title: "PAGER", robots: NO_INDEX };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await readPublishedSnapshot(slug);
  if (!snapshot) notFound();
  if (snapshot.page.slug !== slug) permanentRedirect(`/${encodeURIComponent(snapshot.page.slug)}`);
  const { jsonLd } = pageDiscovery(snapshot.state, snapshot.sourcePage, snapshot.page.demo);
  return <>{jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}<PublicPageScreen key={slug} slug={slug} initialPage={snapshot.page} initialItems={snapshot.items} /></>;
}
