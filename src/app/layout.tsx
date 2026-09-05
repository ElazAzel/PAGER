import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { entryLocale, LOCALE_COOKIE } from "@/lib/entry-locale";
import { canonicalOrigin } from "@/lib/server/seo";
import "./globals.css";
import "./ui/platform-appearance.css";
import "./ui/page-appearance.css";
import "./ui/pager-visual-system.css";
import { PlatformPreferences } from "./ui/platform-preferences";

export function generateMetadata(): Metadata {
  const origin = canonicalOrigin();
  return {
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  title: "PAGER — personal pages that move people forward",
  description: "A thoughtful home for your work, bookings and client relationships.",
  icons: { icon: "/pager-icon.svg", apple: "/icon-192.png" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f0e9",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = entryLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return <html lang={locale}><body>{children}<PlatformPreferences /></body></html>;
}
