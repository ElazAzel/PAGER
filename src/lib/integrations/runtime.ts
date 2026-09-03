import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DatabaseState, Integration, Order, User } from "../types";
import { assertSameOrigin, requireUser } from "../server/auth";
import { isDemoMode } from "../server/store";
import { ApiError, jsonError } from "../server/http";
import { assertDemoRequest, IntegrationError, isLoopback } from "./security";
import type { CommerceIntegration } from "./model";

export const runtime = "nodejs";
export function integrationFor(state: DatabaseState, ownerId: string): CommerceIntegration {
  let integration: Integration | undefined = state.integrations.find(i => i.ownerId === ownerId);
  if (!integration) { integration = { id: randomUUID(), ownerId, updatedAt: new Date().toISOString() }; state.integrations.push(integration); }
  return integration as CommerceIntegration;
}
export function env(name: string): string { const value = process.env[name]; if (!value) throw new IntegrationError(503, `${name} is not configured`); return value; }
export function appOrigin(): string {
  const url = new URL(env("PAGER_APP_URL"));
  if (url.username || url.password || (url.protocol !== "https:" && !(isDemoMode() && isLoopback(url.hostname)))) throw new IntegrationError(503, "PAGER_APP_URL must be a trusted HTTPS origin (loopback HTTP is allowed in demo)");
  return url.origin;
}
export async function authenticated(request: Request, write = true): Promise<User> {
  if (isDemoMode()) assertDemoRequest(request, true);
  if (write) assertSameOrigin(request);
  return requireUser();
}
export async function creator(request: Request, write = true): Promise<User> { const user = await authenticated(request, write); if (user.role !== "creator") throw new IntegrationError(403, "Creator account required"); return user; }
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await rawBody(request, 32768);
  try { return schema.parse(JSON.parse(raw)); } catch { throw new IntegrationError(400, "Invalid request body"); }
}
export async function rawBody(request: Request, max = 1_048_576): Promise<string> {
  if (Number(request.headers.get("content-length")) > max) throw new IntegrationError(413, "Request too large");
  const reader = request.body?.getReader(); if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new IntegrationError(413, "Request too large"); } chunks.push(value); }
  return Buffer.concat(chunks).toString("utf8");
}
export function response(data: unknown, status = 200): Response { return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } }); }
export async function route(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (error) { return jsonError(error instanceof IntegrationError ? new ApiError(error.status, error.message) : error); }
}
export function demoFields() { return isDemoMode() ? { demo: true, provider: "local_demo", notice: "LOCAL DEMO / ЛОКАЛЬНАЯ ДЕМОНСТРАЦИЯ — no real payment, booking or notification was sent." } : { demo: false }; }
export function ownedOrder(state: DatabaseState, id: string, user: User, ownerOnly = false): Order {
  const order = state.orders.find(o => o.id === id && (ownerOnly ? o.ownerId === user.id : o.buyerId === user.id));
  if (!order) throw new IntegrationError(404, "Order not found");
  if (order.test !== isDemoMode()) throw new IntegrationError(403, "Order belongs to a different integration mode");
  return order;
}
export function publicOrder(order: Order): Order { const copy = { ...order } as Order & { commerce?: unknown }; delete copy.commerce; return copy; }
