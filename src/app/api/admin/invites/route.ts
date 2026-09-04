import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { createCreatorInvite } from "@/lib/server/enrollment";
import { mutateState } from "@/lib/server/store";
import { route } from "@/lib/server/routes";
import { body, json } from "@/lib/server/http";
import { emailSchema } from "@/lib/server/validation";
export const runtime = "nodejs";
export async function POST(request: Request) { return route(request, async () => {
  const admin = await requireAdmin();
  const input = z.object({ email: emailSchema }).strict().parse(await body(request));
  const invite = await mutateState(state => createCreatorInvite(state, admin.id, input.email));
  // Creation is not an email send; invitee signs in through the normal verified OTP flow.
  return json({ id: invite.id, expiresAt: invite.expiresAt, sent: false }, 201);
}, true); }
