import "server-only";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "ApiError"; }
}
export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) return Response.json({ error: "Invalid request / Некорректный запрос" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  // Do not return database errors, provider responses, tokens or submitted data.
  console.error("PAGER request failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: "Request failed / Не удалось выполнить запрос" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
}
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
}
export async function body(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "JSON required");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Request body required");
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 1_048_576) { await reader.cancel(); throw new ApiError(413, "Request too large"); }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
