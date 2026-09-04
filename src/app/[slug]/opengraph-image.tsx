import { ImageResponse } from "next/og";
import { readPublishedSnapshot } from "@/lib/server/seo";
import { plainText } from "@/lib/public-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "PAGER";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await readPublishedSnapshot(slug);
  if (!snapshot) return new Response("Not found", { status: 404 });
  const title = plainText(snapshot.page.title).slice(0, 95);
  const description = plainText(snapshot.page.description).slice(0, 160);
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "70px 78px", background: "#f6f2ea", color: "#1c2923", fontFamily: "sans-serif" }}><div style={{ display: "flex", fontSize: 26, letterSpacing: "0.2em" }}>PAGER · {snapshot.page.locale === "ru" ? "СТРАНИЦА АВТОРА" : "CREATOR PAGE"}</div><div style={{ display: "flex", flexDirection: "column", gap: 25 }}><div style={{ fontSize: title.length > 55 ? 60 : 78, fontWeight: 700, lineHeight: 1.06, letterSpacing: "-0.04em" }}>{title}</div><div style={{ fontSize: 30, lineHeight: 1.35, color: "#596259" }}>{description}</div></div><div style={{ display: "flex", height: 10, width: 110, background: "#c07960", borderRadius: 5 }} /></div>, size);
}
