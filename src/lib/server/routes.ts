import "server-only";
import { jsonError } from "./http";
import { assertSameOrigin } from "./auth";
import { assertDemoRequest, isDemoMode } from "./demo";

export async function route(request: Request, handler: () => Promise<Response>, mutation = false): Promise<Response> {
  try { if (isDemoMode()) assertDemoRequest(request); if (mutation && !isDemoMode()) assertSameOrigin(request); return await handler(); }
  catch (error) { return jsonError(error); }
}
