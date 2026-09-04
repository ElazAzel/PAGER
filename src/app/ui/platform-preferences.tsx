"use client";

import { Suspense, useId, useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Contrast, Monitor, Moon, Sun, X } from "lucide-react";
import type { Locale } from "@/lib/types";
import {
  applyPlatformAppearance,
  createPlatformAppearanceStore,
  createPlatformLocaleStore,
  isPlatformAppearanceRoute,
  type PlatformMotion,
  type PlatformTheme,
} from "@/lib/platform-appearance";
import styles from "./platform-preferences.module.css";

const store = createPlatformAppearanceStore();
const localeStore = createPlatformLocaleStore();

export function usePlatformLocale(locale: Locale) {
  useLayoutEffect(() => {
    localeStore.set(locale);
    return () => localeStore.set("ru");
  }, [locale]);
}
const copy = {
  ru: {
    title: "Вид и движение",
    description: "Настройте PAGER для себя в этом браузере.",
    theme: "Тема PAGER",
    light: "Светлая",
    dark: "Тёмная",
    system: "Системная",
    themeHelp: "Тема меняет интерфейс PAGER. Оформление страниц выбирают их авторы.",
    motion: "Движение",
    standard: "Обычное",
    standardHelp: "Короткие переходы и отклики на действия.",
    reduced: "Уменьшенное",
    reducedHelp: "Без анимаций и плавных переходов, в том числе на страницах авторов.",
    systemMotion: "На устройстве включено уменьшение движения. PAGER учитывает его при любом выборе.",
    storageUnavailable: "Настройка действует в этой вкладке. Браузер не разрешил сохранить её для следующего визита.",
    close: "Закрыть настройки",
    done: "Готово",
  },
  en: {
    title: "Appearance and motion",
    description: "Make PAGER comfortable for you in this browser.",
    theme: "PAGER theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    themeHelp: "Theme changes the PAGER interface. Authors choose the look of their pages.",
    motion: "Motion",
    standard: "Standard",
    standardHelp: "Short transitions and feedback as you interact.",
    reduced: "Reduced",
    reducedHelp: "No animations or smooth transitions, including on author pages.",
    systemMotion: "Your device has reduced motion enabled. PAGER respects it with either option.",
    storageUnavailable: "Your choice applies in this tab. Your browser could not save it for your next visit.",
    close: "Close appearance settings",
    done: "Done",
  },
} as const;
const themes = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] satisfies Array<{ value: PlatformTheme; icon: typeof Sun }>;
const motions: PlatformMotion[] = ["standard", "reduced"];

/**
 * Mount once as a direct body child, after {children}, in the root layout.
 * Import ./ui/platform-appearance.css after globals.css in that layout.
 * The built-in Suspense fallback also covers dynamic usePathname routes.
 */
export function PlatformPreferences({ locale }: { locale?: Locale }) {
  return <Suspense fallback={null}><PlatformPreferencesController locale={locale} /></Suspense>;
}

function PlatformPreferencesController({ locale: overrideLocale }: { locale?: Locale }) {
  const pathname = usePathname();
  const appearance = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const id = useId();
  const screenLocale = useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getServerSnapshot);
  const locale = overrideLocale ?? screenLocale;
  const text = copy[locale];

  // Layout effects remove the platform theme before painting an author route.
  useLayoutEffect(() => {
    if (appearance.ready) applyPlatformAppearance(document.body, pathname, appearance);
  }, [pathname, appearance]);
  useLayoutEffect(() => () => {
    delete document.body.dataset.platformTheme;
    delete document.body.dataset.platformMotion;
  }, []);

  // A stable SSR/first-client fallback also avoids pathname rewrite mismatches.
  if (!appearance.ready || !isPlatformAppearanceRoute(pathname)) return null;
  const navigation = pathname?.replace(/\/+$/, "") === "/dashboard" ? "dashboard"
    : pathname === "/admin" || pathname?.startsWith("/admin/") ? "admin" : undefined;

  return <Dialog.Root key={pathname}>
    <Dialog.Trigger asChild>
      <button type="button" lang={locale} className={styles.trigger} data-navigation={navigation} aria-label={text.title} title={text.title}>
        <Contrast aria-hidden="true" size={20} strokeWidth={1.7} />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.dialog} lang={locale}>
        <div className={styles.heading}>
          <div>
            <p className={styles.brand}>PAGER</p>
            <Dialog.Title className={styles.title}>{text.title}</Dialog.Title>
          </div>
          <Dialog.Close asChild>
            <button type="button" className={styles.close} aria-label={text.close}><X aria-hidden="true" size={20} /></button>
          </Dialog.Close>
        </div>
        <Dialog.Description className={styles.description}>{text.description}</Dialog.Description>

        <fieldset className={styles.fieldset} aria-describedby={`${id}-theme-help`}>
          <legend>{text.theme}</legend>
          <div className={styles.themes}>
            {themes.map(({ value, icon: ThemeIcon }) => <label className={styles.theme} key={value}>
              <input type="radio" name={`${id}-theme`} value={value} checked={appearance.theme === value} onChange={() => store.update({ theme: value })} />
              <span className={styles.themeChoice}>
                <ThemeIcon aria-hidden="true" size={21} strokeWidth={1.6} />
                <span>{text[value]}</span>
              </span>
            </label>)}
          </div>
          <p className={styles.help} id={`${id}-theme-help`}>{text.themeHelp}</p>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>{text.motion}</legend>
          <div className={styles.motions}>
            {motions.map(value => <label className={styles.motion} key={value}>
              <input type="radio" name={`${id}-motion`} value={value} checked={appearance.motion === value}
                aria-labelledby={`${id}-${value}-label`} aria-describedby={`${id}-${value}-help`} onChange={() => store.update({ motion: value })} />
              <span>
                <span className={styles.motionLabel} id={`${id}-${value}-label`}>{text[value]}</span>
                <span className={styles.help} id={`${id}-${value}-help`}>{value === "standard" ? text.standardHelp : text.reducedHelp}</span>
              </span>
            </label>)}
          </div>
          {appearance.systemReducedMotion && <p className={styles.systemNote} role="status">{text.systemMotion}</p>}
        </fieldset>
        {!appearance.storageAvailable && <p className={styles.systemNote} role="status">{text.storageUnavailable}</p>}
        <Dialog.Close asChild><button type="button" className={styles.done}>{text.done}</button></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
