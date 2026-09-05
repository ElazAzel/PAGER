"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { entryLocale, LOCALE_COOKIE } from "@/lib/entry-locale";
import type { Locale } from "@/lib/types";
import styles from "./recovery.module.css";

const copy = {
  ru: {
    missing: "Страница недоступна",
    missingDescription: "Проверьте ссылку. Возможно, автор изменил адрес или закрыл доступ к странице.",
    failed: "Не удалось открыть страницу",
    failedDescription: "Попробуйте ещё раз. Если ошибка повторится, вернитесь немного позже.",
    retry: "Попробовать снова", home: "На главную", purchases: "Мои покупки", language: "Язык интерфейса",
  },
  en: {
    missing: "Page unavailable",
    missingDescription: "Check the link. The author may have changed the address or restricted access to the page.",
    failed: "This page could not load",
    failedDescription: "Please try again. If the problem continues, come back a little later.",
    retry: "Try again", home: "Go to homepage", purchases: "My purchases", language: "Interface language",
  },
};

const subscribe = () => () => {};
function browserLocale(): Locale {
  const cookie = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${LOCALE_COOKIE}=`));
  return entryLocale(cookie?.slice(LOCALE_COOKIE.length + 1) ?? document.documentElement.lang);
}

/** Recovery must work without session, page data or an API request. Never render error details. */
export function RecoveryScreen({ kind, retry, initialLocale = "ru" }: {
  kind: "missing" | "failed"; retry?: () => void; initialLocale?: Locale;
}) {
  const preferred = useSyncExternalStore(subscribe, browserLocale, () => initialLocale);
  const [chosen, setChosen] = useState<Locale | null>(null);
  const locale = chosen ?? preferred;
  const text = copy[locale];
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => { document.documentElement.lang = previous; };
  }, [locale]);
  const choose = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setChosen(next);
  };

  return <main className={styles.screen} lang={locale}>
    <div className={styles.content}>
      <Link className={styles.brand} href="/" aria-label="PAGER">PAGER<span aria-hidden="true">.</span></Link>
      <div className={styles.languages} role="group" aria-label={text.language}>
        <button type="button" lang="ru" aria-pressed={locale === "ru"} onClick={() => choose("ru")}>Русский</button>
        <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => choose("en")}>English</button>
      </div>
      <p className={styles.marker} aria-hidden="true">{kind === "missing" ? "404" : "PAGER"}</p>
      <h1>{text[kind]}</h1>
      <p className={styles.description}>{kind === "missing" ? text.missingDescription : text.failedDescription}</p>
      <div className={styles.actions}>
        {retry && <button type="button" onClick={retry}>{text.retry}</button>}
        <Link href="/">{text.home}</Link>
        <Link href="/purchases">{text.purchases}</Link>
      </div>
    </div>
  </main>;
}
