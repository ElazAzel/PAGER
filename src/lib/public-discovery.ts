import type { CatalogItem, PublicBlock, PublicPage } from "./types";

export function plainText(value = ""): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}

export function bookingBlockForItem(page: PublicPage, itemId: string): PublicBlock | undefined {
  if (page.locked) return;
  return page.blocks.find(block => block.type === "booking" && !block.locked && !block.hidden && !block.archived && block.data?.itemIds?.includes(itemId));
}

export function publicAction(page: PublicPage, items: CatalogItem[]): { block: PublicBlock; item?: CatalogItem; label: string; kind: "booking" | "lead" } | undefined {
  if (page.locked || page.paid) return;
  const visible = page.blocks.filter(block => !block.paid && !block.locked && !block.hidden && !block.archived && block.data);
  const booking = visible.find(block => block.type === "booking");
  if (booking) return { block: booking, item: items.find(item => item.kind === "service" && booking.data?.itemIds?.includes(item.id)), label: booking.data?.label || (page.locale === "ru" ? "Записаться" : "Book a session"), kind: "booking" };
  const form = visible.find(block => block.type === "form");
  if (form) return { block: form, label: form.data?.label || (page.locale === "ru" ? "Оставить заявку" : "Send an inquiry"), kind: "lead" };
}

// Only coarse categories leave the browser. Referrer paths, queries and user agents do not.
export function trafficSource(referrer: string, origin: string): "direct" | "search" | "social" | "ai" | "referral" {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return "direct";
    const host = url.hostname.toLowerCase();
    const matches = (domains: string[]) => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
    if (matches(["chatgpt.com", "chat.openai.com", "perplexity.ai", "claude.ai", "gemini.google.com", "copilot.microsoft.com"])) return "ai";
    if (matches(["google.com", "google.ru", "google.kz", "google.co.uk", "bing.com", "yandex.ru", "yandex.com", "yandex.kz", "duckduckgo.com", "search.yahoo.com"])) return "search";
    if (matches(["instagram.com", "facebook.com", "t.co", "x.com", "twitter.com", "linkedin.com", "tiktok.com", "youtube.com", "t.me", "telegram.org", "vk.com", "pinterest.com"])) return "social";
  } catch { return "direct"; }
  return "referral";
}

export function trafficDevice(userAgent: string, touchPoints = 0): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!userAgent) return "unknown";
  if (/ipad|tablet/i.test(userAgent) || (/macintosh/i.test(userAgent) && touchPoints > 1) || (/android/i.test(userAgent) && !/mobile/i.test(userAgent))) return "tablet";
  return /mobile|iphone|ipod/i.test(userAgent) ? "mobile" : "desktop";
}
