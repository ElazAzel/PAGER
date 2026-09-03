import { cookies } from "next/headers";
import { z } from "zod";
import { assertDemoRequest } from "@/lib/server/demo";
import { readState } from "@/lib/server/store";
import { DEMO_IDENTITIES } from "@/lib/server/seed";
import { DEMO_COOKIE, DEMO_TTL_SECONDS, demoSecret, signDemoSession } from "@/lib/server/demo-session";
import { ApiError, body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => {
  assertDemoRequest(request);
  const input = z.object({ role: z.enum(["creator", "buyer"]), identity: z.enum(["primary", "secondary"]).default("primary") }).strict().parse(await body(request));
  const id = DEMO_IDENTITIES[input.role][input.identity]; const user = (await readState()).users.find(u => u.id === id);
  if (!user) throw new ApiError(503, "Demo identity missing");
  (await cookies()).set(DEMO_COOKIE, signDemoSession(id, await demoSecret()), { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/", maxAge: DEMO_TTL_SECONDS });
  return json({ user });
}, true); }
