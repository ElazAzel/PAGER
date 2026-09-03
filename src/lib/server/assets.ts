import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Asset, DatabaseState, User } from "../types";
import { assetIdsInData } from "./sanitize";
import { canReadBlockMaterial, canAccessItem, hasItemGrant } from "./access";
import { demoDirectory } from "./demo";
import { isDemoMode, mutateState, readState } from "./store";
import { ApiError } from "./http";
import { DEMO_WORKBOOK } from "./seed";

export function canAccessAsset(state: DatabaseState, asset: Asset, userId?: string): boolean {
  if (asset.ownerId === userId) return true;
  const items = state.items.filter(i => i.ownerId === asset.ownerId && i.pageId === asset.pageId);
  // A digital delivery file cannot become public by reuse as a block image.
  const deliveryItems = items.filter(i => i.fileId === asset.id);
  if (deliveryItems.length) return deliveryItems.some(i => hasItemGrant(state, i, userId));
  const page = state.publishedPages.find(p => p.id === asset.pageId && p.ownerId === asset.ownerId && p.publishedAt);
  if (!page) return false;
  if (page.blocks.some(b => assetIdsInData(b.data).includes(asset.id) && canReadBlockMaterial(page, b, userId, state.entitlements))) return true;
  return items.some(i => i.image === `/api/assets/${asset.id}` && (canAccessItem(state, i, userId) || hasItemGrant(state, i, userId)));
}
const MAX_ASSET = 10 * 1024 * 1024;
function detectedMime(bytes: Buffer, reported: string): string {
  const prefix = bytes.subarray(0, 16);
  if (prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(prefix.subarray(0, 6).toString())) return "image/gif";
  if (prefix.subarray(0, 4).toString() === "RIFF" && prefix.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (prefix.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (prefix[0] === 80 && prefix[1] === 75 && prefix[2] === 3 && prefix[3] === 4) return "application/zip";
  if (prefix.subarray(4, 8).toString() === "ftyp" && reported === "video/mp4") return "video/mp4";
  if ((prefix.subarray(0, 3).toString() === "ID3" || (prefix[0] === 255 && (prefix[1] & 224) === 224)) && reported === "audio/mpeg") return "audio/mpeg";
  if (["text/plain", "text/csv"].includes(reported)) { try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return reported; } catch { /* reject */ } }
  throw new ApiError(415, "Unsupported file. Use PNG, JPEG, GIF, WebP, PDF, ZIP, UTF-8 text, MP3 or MP4.");
}
function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new ApiError(503, "Private storage is not configured");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from("pager-private");
}
export async function boundedMultipart(request: Request): Promise<FormData> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new ApiError(415, "Multipart file required");
  const reader = request.body?.getReader(); if (!reader) throw new ApiError(400, "File required");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > MAX_ASSET + 64 * 1024) { await reader.cancel(); throw new ApiError(413, "Maximum upload is 10 MB"); } chunks.push(part.value); }
  return new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type")! } }).formData();
}
export async function uploadAsset(user: User, pageId: string, file: File): Promise<{ asset: Asset; url: string }> {
  const state = await readState(); if (!state.pages.some(p => p.id === pageId && p.ownerId === user.id)) throw new ApiError(403, "Page access denied");
  if (!file.size || file.size > MAX_ASSET) throw new ApiError(413, "Maximum upload is 10 MB");
  const bytes = Buffer.from(await file.arrayBuffer()); const mime = detectedMime(bytes, file.type);
  const id = randomUUID(); const storagePath = `${user.id}/${pageId}/${id}`;
  const asset: Asset = { id, ownerId: user.id, pageId, filename: path.basename(file.name).replace(/[\x00-\x1f\x7f"\\/]/g, "_").slice(0, 180) || "file", mime, path: storagePath, size: bytes.length, createdAt: new Date().toISOString() };
  const diskPath = path.join(demoDirectory(), "assets", storagePath);
  if (isDemoMode()) { await mkdir(path.dirname(diskPath), { recursive: true, mode: 0o700 }); await writeFile(diskPath, bytes, { flag: "wx", mode: 0o600 }); }
  else { const { error } = await storage().upload(storagePath, bytes, { contentType: mime, upsert: false, cacheControl: "0" }); if (error) throw new ApiError(502, "Private storage upload failed"); }
  try { await mutateState(current => { if (!current.pages.some(p => p.id === pageId && p.ownerId === user.id)) throw new ApiError(403, "Page access denied"); current.assets.push(asset); }); }
  catch (error) { if (isDemoMode()) await unlink(diskPath); else await storage().remove([storagePath]); throw error; }
  return { asset, url: `/api/assets/${id}` };
}
export async function assetResponse(id: string, userId?: string): Promise<Response> {
  const state = await readState(); const asset = state.assets.find(a => a.id === id);
  if (!asset || !canAccessAsset(state, asset, userId)) throw new ApiError(404, "Asset not found");
  const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  if (!isDemoMode()) {
    const { data, error } = await storage().createSignedUrl(asset.path, 60, { download: asset.mime.startsWith("image/") ? false : asset.filename });
    if (error || !data?.signedUrl) throw new ApiError(502, "Private file unavailable");
    return new Response(null, { status: 302, headers: { ...privateHeaders, Location: data.signedUrl } });
  }
  let bytes: Buffer;
  if (asset.id === "anna-workbook-file" && asset.path === "seed/anna-workbook.txt") bytes = Buffer.from(DEMO_WORKBOOK);
  else {
    const root = path.resolve(demoDirectory(), "assets"); const target = path.resolve(root, asset.path);
    if (!target.startsWith(root + path.sep)) throw new ApiError(404, "Asset not found");
    try { const actual = await realpath(target); if (!actual.startsWith((await realpath(root)) + path.sep)) throw new ApiError(404, "Asset not found"); bytes = await readFile(actual); } catch { throw new ApiError(404, "Asset not found"); }
  }
  const inline = ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(asset.mime);
  return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": asset.mime, "Content-Length": String(bytes.length), "Content-Security-Policy": "sandbox; default-src 'none'", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="download"; filename*=UTF-8''${encodeURIComponent(asset.filename)}` } });
}
