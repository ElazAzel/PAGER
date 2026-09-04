import type { MetadataRoute } from "next";
import { canonicalOrigin } from "@/lib/server/seo";

export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  const origin = canonicalOrigin();
  if (!origin) return { rules: { userAgent: "*", disallow: "/" } };
  // Search crawling and model-training crawling are distinct choices.
  const disallow = ["/api/", "/checkout/", "/admin$", "/admin/", "/dashboard$", "/dashboard/", "/login$", "/purchases$", "/purchases/"];
  return { rules: [{ userAgent: ["*", "OAI-SearchBot"], allow: "/", disallow }, { userAgent: "GPTBot", disallow: "/" }], sitemap: `${origin}/sitemap.xml` };
}
