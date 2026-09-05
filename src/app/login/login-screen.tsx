"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/types";
import { postLoginDestination, type LoginRole } from "@/lib/auth-intent";
import { AuthModal } from "../ui/public-page";
import { usePlatformLocale } from "../ui/platform-preferences";

export function LoginScreen({ locale: initialLocale, role, returnTo }: { locale: Locale; role: LoginRole; returnTo: string }) {
  const router = useRouter();
  const [locale, setLocale] = useState(initialLocale);
  usePlatformLocale(locale);
  return <div lang={locale} className="app-background screen"><AuthModal locale={locale} onLocaleChange={setLocale} role={role} onClose={() => router.push("/")} onComplete={user => router.replace(postLoginDestination(user.role, returnTo))} /></div>;
}
