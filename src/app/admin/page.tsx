import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminMfaRequired, loadAdminWorkspace } from "@/lib/server/admin";
import { ApiError } from "@/lib/server/http";
import { AdminPanel } from "../ui/admin-panel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "PAGER — Admin", robots: { index: false, follow: false, nocache: true } };

export default async function AdminPage() {
  const workspace = await loadAdminWorkspace().catch((error: unknown) => {
    if (error instanceof AdminMfaRequired) redirect("/admin/mfa");
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  });
  return <AdminPanel initial={workspace.overview} initialCreators={workspace.creators} initialAudit={workspace.audit} />;
}
