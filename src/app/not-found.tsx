import { cookies } from "next/headers";
import { entryLocale, LOCALE_COOKIE } from "@/lib/entry-locale";
import { RecoveryScreen } from "./recovery/recovery-screen";

export default async function NotFound() {
  const locale = entryLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return <RecoveryScreen kind="missing" initialLocale={locale} />;
}
