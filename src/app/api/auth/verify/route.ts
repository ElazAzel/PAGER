import { z } from "zod";
import { currentUser, supabaseAuth } from "@/lib/server/auth";
import { isDemoMode } from "@/lib/server/store";
import { ApiError, body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
import { emailSchema } from "@/lib/server/validation";
import { rateLimit, requestKey } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => {
  if (isDemoMode()) throw new ApiError(409, "Use local demo sign-in");
  const input = z.object({ email: emailSchema, token: z.string().regex(/^\d{6,10}$/) }).strict().parse(await body(request));
  await rateLimit(`verify:email:${input.email}`, 10, 5 * 60_000); await rateLimit(`verify:ip:${requestKey(request)}`, 30, 5 * 60_000);
  const client = await supabaseAuth(); const { error } = await client.auth.verifyOtp({ email: input.email, token: input.token, type: "email" });
  if (error) throw new ApiError(401, "Invalid or expired code / Код неверен или истёк");
  const user = await currentUser(); if (!user) throw new ApiError(401, "Verified session unavailable"); return json({ user });
}, true); }
