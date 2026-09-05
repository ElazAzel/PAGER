"use client";

import type { Locale } from "@/lib/types";
import { LOCALE_COOKIE } from "@/lib/entry-locale";

export function LocaleSwitch({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const choose = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    onChange(next);
  };
  return <div className="locale-switch" role="group" aria-label={locale === "ru" ? "Язык интерфейса" : "Interface language"}>
    <button type="button" lang="ru" aria-pressed={locale === "ru"} onClick={() => choose("ru")}>Русский</button>
    <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => choose("en")}>English</button>
  </div>;
}
