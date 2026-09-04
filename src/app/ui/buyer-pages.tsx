"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CatalogItem, Order, PublicPage, Subscription, User } from "@/lib/types";
import { formatMoney } from "@/lib/blocks";
import { t } from "@/lib/i18n";
import { BlockRenderer } from "./block-renderer";
import { Icon } from "./pager-icon";
import { ApiClientError, apiJson, toErrorMessage } from "./api";
import { AuthModal } from "./public-page";
import { usePlatformLocale } from "./platform-preferences";

type PurchaseData = { orders: Order[]; subscriptions: Subscription[]; entitlements: Array<{ id: string; pageId: string; blockId?: string; scope: string; status: string; expiresAt: string | null; orderId: string }>; bookings: Array<{ id: string; title: string; startAt: string; timezone?: string; status: string }>; pages: PublicPage[]; items: CatalogItem[]; demo: boolean };

function BuyerHeader({ user, onSignOut }: { user: User; onSignOut: () => void }) { return <header className="topbar"><Link href="/" className="wordmark">PAGER<span>.</span></Link><div className="topbar-actions"><span className="status-chip green">{user.name}</span><button className="icon-button" onClick={onSignOut} aria-label={t(user.locale, "signOut")}><Icon name="LogOut" size={17} /></button></div></header>; }

export function CheckoutScreen({ id }: { id: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [locale, setLocale] = useState<"ru" | "en">("ru");
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiJson<{ order: Order; demo: boolean; locale?: "ru" | "en" }>("/api/checkout/" + encodeURIComponent(id))
      .then(result => { if (!active) return; setOrder(result.order); setDemo(result.demo); setLocale(result.locale === "en" ? "en" : "ru"); })
      .catch(err => { if (active) setError(toErrorMessage(err)); });
    return () => { active = false; };
  }, [id]);

  const action = async (name: "pay" | "cancel") => {
    setBusy(true);
    setError("");
    try {
      const result = await apiJson<{ order: Order }>("/api/checkout/" + encodeURIComponent(id), { method: "POST", body: JSON.stringify({ action: name }) });
      setOrder(result.order);
    } catch (err) { setError(toErrorMessage(err)); } finally { setBusy(false); }
  };

  if (error) return <main className="app-background screen"><div className="empty-state" role="alert">{error}<br /><button type="button" className="button button-secondary" style={{ marginTop: 15 }} onClick={() => router.back()}>{t(locale, "returnPage")}</button></div></main>;
  if (!order) return <main className="app-background screen"><Loading /></main>;

  const paid = order.status === "paid";
  const terminal = order.status !== "pending" && !paid;
  const statusLabel = order.status === "expired" ? t(locale, "expired") : order.status === "failed" ? t(locale, "failed") : order.status === "refunded" ? t(locale, "refunded") : order.status === "disputed" ? t(locale, "disputed") : order.status;

  return <main className="app-background screen"><div className="subpage checkout-page"><div className="topbar"><Link href="/" className="wordmark">PAGER<span>.</span></Link><button type="button" className="icon-button" onClick={() => router.back()} aria-label={t(locale, "back")}><Icon name="X" /></button></div><div className="checkout-card"><div className="eyebrow">{demo ? t(locale, "demo") : "PAGER checkout"}</div><h1>{paid ? t(locale, "success") : terminal ? statusLabel : t(locale, "pay")}</h1><p className="muted">{order.title}</p><div className="checkout-total"><span>{t(locale, "total")}</span><strong>{formatMoney(order.amount + order.shippingAmount, order.currency, locale)}</strong></div>{demo && <div className="notice"><Icon name="Info" size={16} />{t(locale, "demoHelp")}</div>}{paid ? <button type="button" className="button button-primary" style={{ width: "100%" }} onClick={() => router.push("/purchases")}>{t(locale, "purchases")}</button> : terminal ? <><div className="notice error-notice" role="alert"><Icon name="Info" size={16} />{statusLabel}</div><button type="button" className="button button-secondary" style={{ width: "100%" }} onClick={() => router.back()}>{t(locale, "returnPage")}</button></> : <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => action("cancel")} disabled={busy}>{t(locale, "cancel")}</button><button type="button" className="button button-primary" onClick={() => action("pay")} disabled={busy}>{t(locale, "pay")}</button></div>}</div></div></main>;
}

function Loading() { return <div className="empty-state" role="status"><Icon name="Activity" size={18} /> Загрузка…</div>; }

export type LibraryTab = "pages" | "items" | "bookings";

export function LibraryTabs({ locale, tab, onTabChange }: { locale: "ru" | "en"; tab: LibraryTab; onTabChange: (tab: LibraryTab) => void }) {
  const labels = { pages: locale === "ru" ? "Материалы" : "Materials", items: t(locale, "orders"), bookings: t(locale, "bookings") };
  return <div className="editor-tabs library-tabs" role="tablist" aria-label={locale === "ru" ? "Разделы библиотеки" : "Library sections"}>{(Object.keys(labels) as LibraryTab[]).map(key => <button key={key} type="button" role="tab" id={`library-tab-${key}`} aria-selected={tab === key} aria-controls={`library-${key}-panel`} className={tab === key ? "editor-tab active" : "editor-tab"} onClick={() => onTabChange(key)}>{labels[key]}</button>)}</div>;
}

export function PurchasesScreen() {
  const router = useRouter();
  const [data, setData] = useState<PurchaseData | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [auth, setAuth] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<LibraryTab>("pages");

  usePlatformLocale(user?.locale ?? "ru");

  const load = async () => {
    try {
      const [purchases, session] = await Promise.all([apiJson<PurchaseData>("/api/purchases"), apiJson<{ user: User | null }>("/api/session")]);
      setData(purchases); setUser(session.user); setError(""); setNeedsAuth(false);
    } catch (err) {
      setError(toErrorMessage(err)); setNeedsAuth(err instanceof ApiClientError && err.status === 401);
    }
  };

  useEffect(() => {
    let active = true;
    const request = async () => {
      try {
        const [purchases, session] = await Promise.all([apiJson<PurchaseData>("/api/purchases"), apiJson<{ user: User | null }>("/api/session")]);
        if (active) { setData(purchases); setUser(session.user); setError(""); setNeedsAuth(false); }
      } catch (err) {
        if (active) { setError(toErrorMessage(err)); setNeedsAuth(err instanceof ApiClientError && err.status === 401); }
      }
    };
    void request();
    return () => { active = false; };
  }, []);

  if (error && !data) return <main className="app-background screen"><div className="empty-state" role="alert">{error}<br /><button type="button" className="button button-primary" style={{ marginTop: 14 }} onClick={() => needsAuth ? setAuth(true) : void load()}>{needsAuth ? t("ru", "signIn") : t("ru", "retry")}</button></div>{auth && <AuthModal locale="ru" demoEnabled={false} onClose={() => setAuth(false)} onComplete={() => { setAuth(false); void load(); }} />}</main>;
  if (!data || !user) return <main className="app-background screen"><Loading /></main>;

  const locale = user.locale;
  const orderStatus: Record<Order["status"], string> = { pending: t(locale, "pending"), paid: t(locale, "paid"), expired: t(locale, "expired"), failed: t(locale, "failed"), refunded: t(locale, "refunded"), disputed: t(locale, "disputed") };
  const signOut = async () => { await apiJson("/api/auth/logout", { method: "POST" }).catch(() => undefined); router.push("/"); };

  const pagesPanel = tab === "pages" ? <div id="library-pages-panel" role="tabpanel" aria-labelledby="library-tab-pages" className="library-pages">{data.pages.length ? data.pages.map(page => <section className="data-card library-page" key={page.id}><div className="data-card-head"><div><h2>{page.title}</h2><span className="small muted">/{page.slug}</span></div><a className="button button-secondary" href={"/" + page.slug}>{t(locale, "visit")}</a></div><div className="public-blocks library-blocks">{page.blocks.map(block => <BlockRenderer key={block.id} block={block} locale={locale} items={data.items} slug={page.slug} library />)}</div></section>) : <div className="empty-state">{t(locale, "noPurchases")}</div>}</div> : null;
  const itemsPanel = tab === "items" ? <div id="library-items-panel" role="tabpanel" aria-labelledby="library-tab-items" className="data-card"><div className="data-card-head"><h2>{t(locale, "orders")}</h2><span className="status-chip">{data.orders.length}</span></div>{data.orders.length ? <div className="data-list">{data.orders.map(order => <div className="data-row" key={order.id}><div className="data-row-title"><strong>{order.title}</strong><span>{formatMoney(order.amount + order.shippingAmount, order.currency, locale)}</span></div><span className={"status-chip " + (order.status === "paid" ? "green" : "")}>{orderStatus[order.status]}</span></div>)}</div> : <div className="empty-state">{t(locale, "noPurchases")}</div>}</div> : null;
  const bookingsPanel = tab === "bookings" ? <div id="library-bookings-panel" role="tabpanel" aria-labelledby="library-tab-bookings" className="data-card"><div className="data-card-head"><h2>{t(locale, "bookings")}</h2></div>{data.bookings.length ? <div className="data-list">{data.bookings.map(booking => <div className="data-row" key={booking.id}><div className="data-row-title"><strong>{booking.title}</strong><span>{new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: booking.timezone || undefined }).format(new Date(booking.startAt))}{booking.timezone ? " · " + booking.timezone : ""}</span></div><span className={"status-chip " + (booking.status === "confirmed" ? "green" : "")}>{booking.status === "confirmed" ? t(locale, "booked") : (locale === "ru" ? "Отменена" : "Cancelled")}</span></div>)}</div> : <div className="empty-state">{t(locale, "noData")}</div>}</div> : null;
  return <main className="app-background screen"><div className="subpage"><BuyerHeader user={user} onSignOut={signOut} /><div className="subpage-heading"><div><div className="eyebrow">PAGER library</div><h1>{t(locale, "purchases")}</h1><p>{locale === "ru" ? "Всё, что вы открыли, купили или забронировали." : "Everything you unlocked, bought or booked."}</p></div><button type="button" className="button button-secondary" onClick={() => router.push("/anna")}><Icon name="ArrowLeft" size={15} />{t(locale, "returnPage")}</button></div>{error && <div className="notice error-notice" role="alert"><Icon name="Info" size={16} />{error}</div>}{data.demo && <div className="notice"><Icon name="Info" size={16} />{t(locale, "demoHelp")}</div>}<LibraryTabs locale={locale} tab={tab} onTabChange={setTab} />{pagesPanel}{itemsPanel}{bookingsPanel}{auth && <AuthModal locale={locale} demoEnabled={data.demo} onClose={() => setAuth(false)} onComplete={() => { setAuth(false); void load(); }} />}</div></main>;
}
