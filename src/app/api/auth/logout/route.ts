import { cookies } from "next/headers";
import { supabaseAuth } from "@/lib/server/auth";
import { isDemoMode } from "@/lib/server/store";
import { DEMO_COOKIE } from "@/lib/server/demo-session";
import { ApiError, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => {
  if (isDemoMode()) (await cookies()).delete(DEMO_COOKIE);
  else { const client = await supabaseAuth(); const { error } = await client.auth.signOut({ scope: "local" }); if (error) throw new ApiError(502, "Sign out failed"); }
  return json({ ok: true });
}, true); }
