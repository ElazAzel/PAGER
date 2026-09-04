import type { MetadataRoute } from "next";
import { canonicalOrigin, publicSitemap } from "@/lib/server/seo";
import { isDemoMode, readState } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = canonicalOrigin();
  if (!origin) return [];
  return publicSitemap(await readState(), isDemoMode(), origin);
}
