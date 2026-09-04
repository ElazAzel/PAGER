import { CreatorScreen } from "../ui/pager-shell";
import { currentUser } from "@/lib/server/auth";
import { isAdminUser } from "@/lib/server/admin";
import type { Metadata } from "next";
import { getCapabilities } from "@/lib/server/capabilities";

export const metadata: Metadata = { title: "Workspace · PAGER", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  return <CreatorScreen canAdmin={isAdminUser(await currentUser())} demoEnabled={getCapabilities().demo} />;
}
