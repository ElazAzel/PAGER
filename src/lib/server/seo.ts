import "server-only";
import type { Metadata, MetadataRoute } from "next";
import { cache } from "react";
import { isIP } from "node:net";
import type { CatalogItem, DatabaseState, Page } from "../types";
import { plainText } from "../public-discovery";
import { canAccessItem, projectItem, projectPublicPage, publicItems } from "./access";
import { isDemoMode, readState } from "./store";
import { isPageAvailable } from "./capabilities";

export const NO_INDEX: Metadata["robots"] = { index: false, follow: false, noarchive: true };

// Never derive a canonical URL from untrusted Host or forwarded headers.
export function canonicalOrigin(value = process.env.PAGER_APP_URL, demo = isDemoMode()): string | null {
  if (demo || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    if (isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") || /(^|\.)(localhost|local|test|invalid|example)$/.test(host) || /(^|\.)example\.(com|org|net)$/.test(host)) return null;
    return url.origin;
  } catch { return null; }
}

export function publishedSnapshot(state: DatabaseState, page: Page, demo: boolean) {
  return { page: projectPublicPage(state, page, undefined, demo), items: publicItems(state, page, undefined) };
}

// React cache only deduplicates this request; no authenticated content is cached or serialized.
export const readPublishedSnapshot = cache(async (slug: string) => {
  const state = await readState();
  const page = state.publishedPages.find(candidate => (candidate.slug === slug || candidate.slugAliases?.includes(slug)) && candidate.publishedAt && isPageAvailable(candidate));
  if (!page) return null;
  return { state, sourcePage: page, ...publishedSnapshot(state, page, isDemoMode()) };
});

function publicUrl(value: string | undefined): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname.startsWith("/api/")) return;
    return url.toString();
  } catch { return; }
}

function date(value: string | null): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

export function pageDiscovery(state: DatabaseState, sourcePage: Page, demo: boolean, origin = canonicalOrigin(undefined, demo)) {
  if (!isPageAvailable(sourcePage)) return { metadata: { title: "PAGER", robots: NO_INDEX } as Metadata, jsonLd: null, indexable: false };
  // Always re-project anonymously, including when an owner or entitled buyer requests metadata.
  const { page } = publishedSnapshot(state, sourcePage, demo);
  const indexable = Boolean(origin && page.publishedAt && !page.paid && !page.locked && !page.demo);
  const title = plainText(page.title) || "PAGER";
  const description = plainText(page.description || page.teaser).slice(0, 170);
  const canonical = origin ? `${origin}/${encodeURIComponent(page.slug)}` : undefined;
  const blocks = indexable ? page.blocks.filter(block => !block.paid && !block.locked && !block.hidden && !block.archived && block.data) : [];
  const profile = blocks.find(block => block.type === "profile")?.data;
  const name = plainText(profile?.name || profile?.title);
  const image = publicUrl(profile?.avatar);
  const metadata: Metadata = {
    title: { absolute: `${title} | PAGER` }, description,
    robots: indexable ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } } : NO_INDEX,
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(name ? { authors: [{ name, ...(canonical ? { url: canonical } : {}) }] } : {}),
    openGraph: { title, description, type: "website", siteName: "PAGER", locale: page.locale === "ru" ? "ru_RU" : "en_US", ...(canonical ? { url: canonical, images: [{ url: `${canonical}/opengraph-image`, width: 1200, height: 630, alt: title }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(canonical ? { images: [`${canonical}/opengraph-image`] } : {}) },
  };
  if (!indexable || !canonical) return { metadata, jsonLd: null, indexable };
  const sameAs = [...new Set(blocks.filter(block => block.type === "socials").flatMap(block => block.data?.items?.map(item => publicUrl(item.url)).filter((value): value is string => Boolean(value)) ?? []))];
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org", "@type": name ? "ProfilePage" : "WebPage", "@id": `${canonical}#page`, url: canonical,
    name: title, description, inLanguage: page.locale, ...(date(page.publishedAt) ? { dateModified: date(page.publishedAt) } : {}),
    ...(name ? { mainEntity: { "@type": "Person", "@id": `${canonical}#author`, name, url: canonical,
      ...(profile?.profession ? { jobTitle: plainText(profile.profession) } : {}),
      ...(profile?.text ? { description: plainText(profile.text) } : {}), ...(image ? { image } : {}), ...(sameAs.length ? { sameAs } : {}),
    } } : {}),
  };
  return { metadata, jsonLd, indexable };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export function anonymousItem(state: DatabaseState, page: Page, itemId: string, sourceBlockId?: string): { item: CatalogItem; blockId: string } | null {
  const item = state.items.find(candidate => candidate.id === itemId && candidate.pageId === page.id && candidate.ownerId === page.ownerId);
  if (!item) return null;
  const block = page.blocks.find(candidate => (!sourceBlockId || candidate.id === sourceBlockId) && !candidate.hidden && !candidate.archived && candidate.data.itemIds?.includes(item.id) && canAccessItem(state, item, undefined, candidate.id));
  return block ? { item: projectItem(state, item, undefined), blockId: block.id } : null;
}

export function itemMetadata(state: DatabaseState, page: Page, itemId: string, demo: boolean, sourceBlockId?: string, origin = canonicalOrigin(undefined, demo)): Metadata {
  const item = anonymousItem(state, page, itemId, sourceBlockId)?.item;
  if (!item) return { title: { absolute: "PAGER" }, robots: NO_INDEX };
  const base = pageDiscovery(state, page, demo, origin);
  const title = plainText(item.title);
  const description = plainText(item.description).slice(0, 170);
  const url = origin ? `${origin}/${encodeURIComponent(page.slug)}/items/${encodeURIComponent(item.id)}` : undefined;
  return { ...base.metadata, title: { absolute: `${title} | ${plainText(page.title)}` }, description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: { ...base.metadata.openGraph, title, description, ...(url ? { url } : {}) }, twitter: { ...base.metadata.twitter, title, description },
  };
}

export function publicSitemap(state: DatabaseState, demo: boolean, origin = canonicalOrigin(undefined, demo)): MetadataRoute.Sitemap {
  if (!origin || demo) return [];
  return state.publishedPages.filter(page => page.publishedAt && !page.paid && isPageAvailable(page)).flatMap(page => {
    const url = `${origin}/${encodeURIComponent(page.slug)}`;
    const pageEntry = { url, ...(date(page.publishedAt) ? { lastModified: date(page.publishedAt) } : {}) };
    const items = publicItems(state, page).filter(item => anonymousItem(state, page, item.id));
    return [pageEntry, ...items.map(item => ({ url: `${url}/items/${encodeURIComponent(item.id)}` }))];
  });
}
