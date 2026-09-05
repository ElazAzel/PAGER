import { HomeScreen } from "./ui/pager-shell";
import { getCapabilities } from "@/lib/server/capabilities";
import { cookies } from "next/headers";
import { entryLocale, LOCALE_COOKIE } from "@/lib/entry-locale";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const capabilities = getCapabilities();
  const locale = entryLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return <HomeScreen locale={locale} demoEnabled={capabilities.demo} creatorSignup={capabilities.creatorSignup} />;
}
