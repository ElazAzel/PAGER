import "server-only";
import sanitizeHtml from "sanitize-html";
import type { BlockData } from "../types";
import { ApiError } from "./http";

export function sanitizeRichText(value: string): string {
  return sanitizeHtml(value, { allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "a", "code", "pre"], allowedAttributes: { a: ["href", "title", "target", "rel"] }, allowedSchemes: ["https", "http", "mailto", "tel"], allowProtocolRelative: false, transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" } }) } });
}
export function safeUrl(value: string, image = false): string {
  if (!value) return "";
  if (/^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(value)) return value;
  if (!image && /^#[a-zA-Z0-9_-]+$/.test(value)) return value;
  if (!image && /^\/(?!\/)[a-zA-Z0-9_/?=&%#.-]*$/.test(value)) return value;
  try { const url = new URL(value); if ((image ? ["https:", "http:"] : ["https:", "http:", "mailto:", "tel:"]).includes(url.protocol) && !url.username && !url.password) return value; } catch { /* rejected below */ }
  throw new ApiError(400, "Unsafe URL");
}
export function sanitizeBlockData(input: BlockData, customCode = false): BlockData {
  const data = structuredClone(input);
  for (const field of ["text", "html"] as const) if (data[field] && !(customCode && field === "html")) data[field] = sanitizeRichText(data[field]);
  for (const field of ["image", "avatar", "beforeImage", "afterImage"] as const) if (data[field]) data[field] = safeUrl(data[field], true);
  for (const field of ["url", "calLink"] as const) if (data[field]) data[field] = safeUrl(data[field]);
  data.items = data.items?.map(item => ({ ...item, ...(item.text ? { text: sanitizeRichText(item.text) } : {}), ...(item.url ? { url: safeUrl(item.url) } : {}), ...(item.image ? { image: safeUrl(item.image, true) } : {}), ...(item.icon && /[/:]/.test(item.icon) ? { icon: safeUrl(item.icon, true) } : {}) }));
  return data;
}
export function assetIdsInData(data: BlockData): string[] {
  const ids = new Set<string>();
  if (data.fileId) ids.add(data.fileId);
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(/\/api\/assets\/([a-zA-Z0-9_-]+)/g)) ids.add(match[1]);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(data); return [...ids];
}
