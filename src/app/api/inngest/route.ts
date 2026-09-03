import { serve } from "inngest/next";
import { inngest, maintenanceFunction, notificationFunction } from "@/lib/integrations/notifications";
import { isDemoMode } from "@/lib/server/store";
const handlers = serve({ client: inngest, functions: [notificationFunction, maintenanceFunction], signingKey: process.env.INNGEST_SIGNING_KEY });
export const runtime = "nodejs";
const enabled = () => !isDemoMode() && Boolean(process.env.INNGEST_SIGNING_KEY);
export const GET: typeof handlers.GET = async (...args) => enabled() ? handlers.GET(...args) : Response.json({ error: "Inngest disabled: configure real mode and signing key" }, { status: 503 });
export const POST: typeof handlers.POST = async (...args) => enabled() ? handlers.POST(...args) : Response.json({ error: "Inngest disabled: configure real mode and signing key" }, { status: 503 });
export const PUT: typeof handlers.PUT = async (...args) => enabled() ? handlers.PUT(...args) : Response.json({ error: "Inngest disabled: configure real mode and signing key" }, { status: 503 });
