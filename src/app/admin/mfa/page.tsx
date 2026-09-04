import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadAdminMfa } from "@/lib/server/admin";
import { ApiError } from "@/lib/server/http";
import { AdminMfaPanel } from "./panel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "PAGER — MFA", robots: { index: false, follow: false, nocache: true } };
export default async function AdminMfaPage() {
  const state = await loadAdminMfa().catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) redirect("/login?returnTo=/admin/mfa");
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  });
  return <AdminMfaPanel initial={state} />;
}
