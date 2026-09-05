import type { Locale } from "./types";

export const LOCALE_COOKIE = "pager_locale";
export function entryLocale(value?: string | null): Locale { return value === "en" ? "en" : "ru"; }
