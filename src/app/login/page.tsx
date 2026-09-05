import { cookies } from "next/headers";
import { entryLocale, LOCALE_COOKIE } from "@/lib/entry-locale";
import { parseLoginRole, safeInternalReturnTo } from "@/lib/auth-intent";
import { LoginScreen } from "./login-screen";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const locale = entryLocale(first(query.lang) ?? (await cookies()).get(LOCALE_COOKIE)?.value);
  return <LoginScreen locale={locale} role={parseLoginRole(first(query.role))} returnTo={safeInternalReturnTo(first(query.returnTo))} />;
}
