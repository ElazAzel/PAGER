import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./ui/platform-appearance.css";
import "./ui/page-appearance.css";
import "./ui/pager-visual-system.css";
import { PlatformPreferences } from "./ui/platform-preferences";

export const metadata: Metadata = {
  title: "PAGER — personal pages that move people forward",
  description: "A thoughtful home for your work, bookings and client relationships.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f0e9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}<PlatformPreferences /></body></html>;
}
