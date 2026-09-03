"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { AuthModal } from "../ui/public-page";

function LoginContent() {
  const router = useRouter();
  const returnTo = typeof window === "undefined" ? "/dashboard" : new URLSearchParams(window.location.search).get("returnTo") || "/dashboard";
  return <div className="app-background screen"><AuthModal locale="ru" onClose={() => router.push("/")} onComplete={user => router.push(user.role === "creator" ? "/dashboard" : returnTo === "/dashboard" ? "/anna" : returnTo)} /></div>;
}

export default function LoginPage() {
  return <Suspense fallback={<div className="app-background screen" />}><LoginContent /></Suspense>;
}
