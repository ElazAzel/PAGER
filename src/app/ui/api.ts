"use client";

export class ApiClientError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload?: unknown) { super(message); this.name = "ApiClientError"; this.status = status; this.payload = payload; }
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new ApiClientError(response.status, message, payload);
  }
  return payload as T;
}

export function toErrorMessage(error: unknown, fallback = "Не удалось выполнить действие") {
  return error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : fallback;
}
