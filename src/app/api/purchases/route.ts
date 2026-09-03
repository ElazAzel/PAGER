import { requireUser } from "@/lib/server/auth";
import { purchaseLibrary } from "@/lib/server/purchases";
import { isDemoMode, readState } from "@/lib/server/store";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/routes";
import { claimBuyerBookings } from "@/lib/integrations/booking-claims";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return route(request, async () => { const user = await requireUser(); await claimBuyerBookings(user); return json(purchaseLibrary(await readState(), user, isDemoMode())); }); }
