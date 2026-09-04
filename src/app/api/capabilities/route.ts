import { getCapabilities } from "@/lib/server/capabilities";
import { json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() { return json(getCapabilities()); }
