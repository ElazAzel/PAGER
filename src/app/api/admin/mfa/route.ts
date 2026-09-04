import { adminMfaInput, loadAdminMfa, updateAdminMfa } from "@/lib/server/admin";
import { body, json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return route(request, async () => json(await loadAdminMfa())); }
export async function POST(request: Request) { return route(request, async () => json(await updateAdminMfa(adminMfaInput.parse(await body(request)))), true); }
