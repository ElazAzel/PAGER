import { z } from "zod";
import { supabaseAuth } from "@/lib/server/auth";
import { isDemoMode } from "@/lib/server/store";
import { ApiError, body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
import { emailSchema } from "@/lib/server/validation";
import { rateLimit, requestKey } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => {
  if (isDemoMode()) throw new ApiError(409, "Use the explicitly labelled local demo sign-in; demo does not send OTP emails");
  const input = z.object({ email: emailSchema, locale: z.enum(["ru", "en"]), role: z.enum(["creator", "buyer"]).optional() }).strict().parse(await body(request));
  await rateLimit("otp:global", 120, 60_000); await rateLimit(`otp:email:${input.email}`, 5, 15 * 60_000); await rateLimit(`otp:ip:${requestKey(request)}`, 20, 15 * 60_000);
  const client = await supabaseAuth(); const { error } = await client.auth.signInWithOtp({ email: input.email, options: { shouldCreateUser: true, data: { locale: input.locale, role: input.role ?? "buyer" } } });
  if (error) throw new ApiError(502, "OTP email could not be sent / Не удалось отправить код");
  return json({ sent: true });
}, true); }
