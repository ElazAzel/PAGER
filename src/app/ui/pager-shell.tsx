"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnalyticsPanel } from "./analytics-panel";
import { PageReadiness } from "./page-readiness";
import type { CatalogItem, DashboardData, Page, Locale } from "@/lib/types";
import { formatMoney } from "@/lib/blocks";
import { t, type MessageKey } from "@/lib/i18n";
import { Icon } from "./pager-icon";
import { ApiClientError, apiJson, toErrorMessage } from "./api";
import { EditorDialog, PageView as EditorPageView, SaveStatus } from "./page-editor";
import { DraftWriter, navigateAfterDraftSave, type DraftState } from "./editor-draft";
import { usePlatformLocale } from "./platform-preferences";
import { LocaleSwitch } from "./locale-switch";

type View = "page" | "clients" | "orders" | "analytics" | "catalog" | "settings";
const navItems: Array<{ view: View; icon: string; label: MessageKey }> = [
  { view: "page", icon: "Pencil", label: "tabPage" },
  { view: "clients", icon: "UsersRound", label: "clients" },
  { view: "orders", icon: "ClipboardList", label: "orders" },
  { view: "analytics", icon: "BarChart3", label: "analytics" },
];

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 3600); return () => window.clearTimeout(timer); }, [onClose]);
  return <div className="toast" role="status"><Icon name="Check" size={15} />{message}</div>;
}

function Loading({ label = "Загружаем…" }: { label?: string }) { return <div className="empty-state"><Icon name="Activity" size={18} /> <span>{label}</span></div>; }

function DemoGate({ role, locale: initialLocale = "ru", demoEnabled = false, creatorSignup = false }: { role: "creator" | "buyer"; locale?: Locale; demoEnabled?: boolean; creatorSignup?: boolean }) {
  const router = useRouter();
  const [locale, setLocale] = useState(initialLocale);
  usePlatformLocale(locale);
  const ru = locale === "ru";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enter = async () => {
    setBusy(true); setError("");
    try { await apiJson("/api/demo/session", { method: "POST", body: JSON.stringify({ role, identity: "primary" }) }); if (role === "creator" && window.location.pathname === "/dashboard") window.location.reload(); else router.push(role === "creator" ? "/dashboard" : "/anna"); }
    catch (err) { setError(toErrorMessage(err, ru ? "Демо доступно только в локальном режиме." : "Demo is available locally only.")); } finally { setBusy(false); }
  };
  const loginPath = `/login?lang=${locale}${role === "creator" && creatorSignup ? "&role=creator" : ""}`;
  return <main lang={locale} className="start-page app-background"><div className="page-width"><div className="start-card"><div className="start-copy">
    <div className="entry-heading"><div className="wordmark">PAGER<span>.</span></div><LocaleSwitch locale={locale} onChange={setLocale} /></div>
    <div className="eyebrow" style={{ marginTop: 42 }}>PAGER / PRIVATE BETA</div>
    <h1>{ru ? "Ваша страница. Следующий разговор — здесь." : "Your page. The next conversation starts here."}</h1>
    <p>{ru ? "Одна ссылка для записи, материалов и спокойной работы с клиентами." : "One link for bookings, resources and thoughtful client relationships."}</p>
    <div className="start-actions">{demoEnabled && <button type="button" className="button button-primary" onClick={enter} disabled={busy}><Icon name="Pencil" size={16} />{ru ? "Открыть локальную демонстрацию" : "Open the local demo"}</button>}<button type="button" className={`button ${demoEnabled ? "button-secondary" : "button-primary"}`} onClick={() => router.push(loginPath)}><Icon name="Mail" size={16} />{role === "creator" && creatorSignup ? (ru ? "Создать страницу" : "Create your page") : (ru ? "Войти по email" : "Sign in with email")}</button></div>
    {error && <div className="notice error-notice" role="alert"><Icon name="Info" size={16} />{error}</div>}
    <div className="start-proof"><span className="proof-dot" />{ru ? "Для независимых консультантов и коучей" : "For independent consultants and coaches"}</div>
    <nav className="entry-legal" aria-label={ru ? "Правовая информация" : "Legal information"}><Link href="/privacy">{ru ? "Конфиденциальность" : "Privacy"}</Link><Link href="/terms">{ru ? "Условия" : "Terms"}</Link></nav>
    </div><div className="start-preview" aria-label={ru ? "Пример страницы автора" : "Example creator page"}><div className="phone-preview"><div className="phone-preview-top"><div className="wordmark">PAGER<span>.</span></div><span className="status-chip">{ru ? "Пример" : "Example"}</span></div><div className="phone-preview-body"><div className="preview-profile"><div className="avatar avatar-lg">AV</div><div><div className="preview-name">{ru ? "Анна Волкова" : "Anna Volkova"}</div><div className="preview-role">{ru ? "Карьерный консультант" : "Career consultant"}</div></div></div><div className="preview-card"><div className="preview-card-icon"><Icon name="CalendarClock" size={18} /></div><div><strong>{ru ? "Личная консультация" : "Personal consultation"}</strong><span>{ru ? "60 минут · $150" : "60 minutes · $150"}</span></div><Icon name="ArrowRight" size={17} /></div><div className="preview-card"><div className="preview-card-icon"><Icon name="FileText" size={18} /></div><div><strong>{ru ? "План на 30 дней" : "Your 30-day plan"}</strong><span>{ru ? "Материал для клиентов" : "A resource for clients"}</span></div><Icon name="LockKeyhole" size={16} /></div></div></div></div></div></div></main>;
}

function WorkspaceError({ message }: { message: string }) {
  return <main className="start-page app-background"><div className="page-width"><div className="start-card"><div className="start-copy"><div className="wordmark">PAGER<span>.</span></div><div className="eyebrow" style={{ marginTop: 42 }}>PAGER / WORKSPACE</div><h1>Не удалось загрузить кабинет</h1><p>{message}</p><button type="button" className="button button-primary" onClick={() => window.location.reload()}><Icon name="Activity" size={16} />Повторить</button></div></div></div></main>;
}
function ShellNav({ locale, active, onNavigate, onSignOut, onOpenAdmin, canAdmin }: { locale: Locale; active: View; onNavigate: (view: View) => void; onSignOut: () => void; onOpenAdmin: () => void; canAdmin: boolean }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = (view: View) => { setMoreOpen(false); onNavigate(view); };
  const adminLink = canAdmin && <Link className="nav-link" href="/admin" onClick={event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); onOpenAdmin();
  }}><Icon name="Shield" size={17} />{locale === "ru" ? "Администрирование" : "Administration"}</Link>;
  const extraItems: Array<{ view: View; icon: string; label: MessageKey }> = [
    { view: "catalog", icon: "ShoppingBag", label: "tabCatalog" },
    { view: "settings", icon: "Settings", label: "settings" },
  ];
  const navButton = (item: typeof navItems[number]) => <button key={item.view} className={`nav-link ${active === item.view ? "active" : ""}`} onClick={() => navigate(item.view)} aria-current={active === item.view ? "page" : undefined}><Icon name={item.icon} size={18} /><span>{t(locale, item.label)}</span></button>;
  return <>
    <aside className="desktop-sidebar">
      <div className="sidebar-brand"><div className="wordmark">PAGER<span>.</span></div></div>
      <div className="sidebar-caption">{locale === "ru" ? "Мой кабинет" : "Workspace"}</div>
      <nav className="side-nav" aria-label={locale === "ru" ? "Основная навигация" : "Main navigation"}>{navItems.map(navButton)}{extraItems.map(navButton)}{adminLink}</nav>
      <div className="sidebar-bottom"><button className="nav-link" onClick={onSignOut}><Icon name="LogOut" size={17} />{t(locale, "signOut")}</button></div>
    </aside>
    <nav className="mobile-nav" aria-label={locale === "ru" ? "Мобильная навигация" : "Mobile navigation"}>
      {navItems.map(navButton)}
      <button className={`nav-link ${moreOpen || active === "catalog" || active === "settings" ? "active" : ""}`} onClick={() => setMoreOpen(open => !open)} aria-expanded={moreOpen} aria-controls="workspace-more"><Icon name="MoreHorizontal" size={18} /><span>{locale === "ru" ? "Ещё" : "More"}</span></button>
      {moreOpen && <div id="workspace-more" className="mobile-more-menu">{extraItems.map(navButton)}{adminLink}<button className="nav-link" onClick={onSignOut}><Icon name="LogOut" size={17} />{t(locale, "signOut")}</button></div>}
    </nav>
  </>;
}
function TopBar({ data, locale, onOpenPage, onSignOut }: { data: DashboardData; locale: Locale; onOpenPage: () => void; onSignOut: () => void }) {
  const statusLabel = data.demo ? (locale === "ru" ? "Демо" : "Demo") : data.page.publishedAt ? t(locale, "published") : t(locale, "notPublished");
  return <header className="topbar"><div className="phone-only"><div className="wordmark">PAGER<span>.</span></div></div><div className="topbar-actions"><span className="demo-pill"><span className="proof-dot" />{statusLabel}</span><button className="icon-button" onClick={onOpenPage} aria-label={t(locale, "openPage")}><Icon name="ExternalLink" size={18} /></button><button className="icon-button" onClick={onSignOut} aria-label={t(locale, "signOut")}><div className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>{data.user.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("")}</div></button></div></header>;
}

function PageSettings({ page, locale, onUpdate }: { page: Page; locale: Locale; onUpdate: (page: Page) => void }) {
  const update = (patch: Partial<Page>) => onUpdate({ ...page, ...patch });
  const price = (key: "oneTime" | "monthly", raw: string) => update({ pricing: { ...page.pricing, [key]: raw ? Math.round(Number(raw) * 100) : undefined } });
  return <><div className="side-section"><label className="field"><span className="side-label">{t(locale, "pageTitle")}</span><input value={page.title} onChange={event => update({ title: event.target.value })} /></label><label className="field"><span className="side-label">{t(locale, "description")}</span><textarea value={page.description} onChange={event => update({ description: event.target.value })} /></label><label className="field"><span className="side-label">{t(locale, "pageAddress")}</span><input value={page.slug} onChange={event => update({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></label></div><div className="side-section"><label className="field"><span className="side-label">{t(locale, "accent")}</span><input type="color" value={page.accent} onChange={event => update({ accent: event.target.value })} /></label><label className="field"><span className="side-label">{t(locale, "language")}</span><select value={page.locale} onChange={event => update({ locale: event.target.value as Locale })}><option value="ru">Русский</option><option value="en">English</option></select></label><div className="switch-row"><span>{t(locale, "wholePage")}</span><button className={`switch ${page.paid ? "on" : ""}`} onClick={() => update({ paid: !page.paid })} aria-pressed={page.paid} aria-label={t(locale, "wholePage")} /></div>{page.paid && <div className="field-row"><label className="field"><span className="side-label">{t(locale, "oneTime")}</span><input type="number" min="0" step="0.01" value={page.pricing.oneTime ? page.pricing.oneTime / 100 : ""} onChange={event => price("oneTime", event.target.value)} /></label><label className="field"><span className="side-label">{t(locale, "monthly")}</span><input type="number" min="0" step="0.01" value={page.pricing.monthly ? page.pricing.monthly / 100 : ""} onChange={event => price("monthly", event.target.value)} /></label></div>}</div></>;
}

function ClientsView({ data, locale, toast }: { data: DashboardData; locale: Locale; toast: (message: string) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const saveNote = async (id: string) => { try { const result = await apiJson<{ contact: DashboardData["contacts"][number] }>(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ notes: notes[id] ?? "" }) }); toast(locale === "ru" ? "Заметка сохранена" : "Note saved"); void result; } catch (error) { toast(toErrorMessage(error)); } };
  return <SubpageHeading locale={locale} title="clients" subtitle={locale === "ru" ? "Каждое обращение становится частью истории." : "Every inquiry becomes part of a relationship."}><div className="data-card"><div className="data-card-head"><h2>{t(locale, "timeline")}</h2><button className="button button-secondary" onClick={() => window.open("/api/contacts/export", "_blank", "noopener,noreferrer")}><Icon name="Download" size={14} />{t(locale, "export")}</button></div><div className="data-list">{data.contacts.length ? data.contacts.map(contact => <div className="data-row" key={contact.id}><div className="data-row-title"><strong>{contact.name}</strong><span>{contact.email} · {new Date(contact.updatedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}</span><input className="client-note-input" value={notes[contact.id] ?? contact.notes} onChange={event => setNotes({ ...notes, [contact.id]: event.target.value })} placeholder={t(locale, "contactNote")} /></div><button className="button button-quiet" onClick={() => saveNote(contact.id)}>{t(locale, "save")}</button></div>) : <div className="empty-state">{t(locale, "noData")}</div>}</div></div></SubpageHeading>;
}

function OrdersView({ data, locale, onData, toast }: { data: DashboardData; locale: Locale; onData: (data: DashboardData) => void; toast: (message: string) => void }) {
  const updateOrder = async (id: string, fulfillment: string) => { try { const result = await apiJson<{ order: DashboardData["orders"][number] }>(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify({ fulfillment }) }); onData({ ...data, orders: data.orders.map(order => order.id === id ? result.order : order) }); toast(locale === "ru" ? "Статус заказа обновлён" : "Order status updated"); } catch (error) { toast(toErrorMessage(error)); } };
  return <SubpageHeading locale={locale} title="orders" subtitle={locale === "ru" ? "Оплаты, товары и отправка в одном списке." : "Payments, products and fulfillment in one place."}><div className="data-card"><div className="data-card-head"><h2>{t(locale, "orders")}</h2><span className="status-chip">{data.orders.length}</span></div><div className="data-list">{data.orders.length ? data.orders.map(order => <div className="data-row" key={order.id}><div className="data-row-title"><strong>{order.title}</strong><span>{formatMoney(order.amount + order.shippingAmount, order.currency, locale)} · {new Date(order.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}</span></div><select className="status-select" value={order.fulfillment} onChange={event => updateOrder(order.id, event.target.value)}><option value="unfulfilled">{t(locale, "unfulfilled")}</option><option value="processing">{t(locale, "processing")}</option><option value="shipped">{t(locale, "shipped")}</option><option value="delivered">{t(locale, "delivered")}</option></select></div>) : <div className="empty-state">{t(locale, "noData")}</div>}</div></div></SubpageHeading>;
}


function CatalogView({ data, locale, onData, toast }: { data: DashboardData; locale: Locale; onData: (data: DashboardData) => void; toast: (message: string) => void }) {
  const [draft, setDraft] = useState<CatalogItem | null>(null);
  const [shippingText, setShippingText] = useState("");

  const openNew = () => {
    setShippingText("");
    setDraft({ id: crypto.randomUUID(), ownerId: data.user.id, pageId: data.page.id, title: locale === "ru" ? "Новый материал" : "New resource", description: "", kind: "digital", price: 1900, currency: "USD", stock: null, reserved: 0, shipping: [], createdAt: new Date().toISOString() });
  };
  const openEdit = (item: CatalogItem) => { setShippingText(item.shipping.map(option => option.country + ": " + option.amount / 100).join(", ")); setDraft(structuredClone(item)); };
  const update = (patch: Partial<CatalogItem>) => setDraft(current => current ? { ...current, ...patch } : current);
  const parseShipping = (value: string) => value.split(",").map(part => {
    const [countryRaw, amountRaw] = part.split(":");
    const country = countryRaw?.trim().toUpperCase() ?? "";
    const amount = Math.round(Number(amountRaw?.trim()) * 100);
    return { country, amount };
  }).filter(option => /^[A-Z]{2}$/.test(option.country) && Number.isSafeInteger(option.amount) && option.amount >= 0);
  const save = async () => {
    if (!draft) return;
    const shipping = draft.kind === "physical" ? parseShipping(shippingText) : [];
    if (!draft.title.trim() || !Number.isSafeInteger(draft.price) || draft.price <= 0 || (draft.kind === "physical" && !shipping.length)) {
      toast(locale === "ru" ? "Заполните название, цену и страны доставки для физического товара." : "Add a title, price and shipping countries for a physical product.");
      return;
    }
    try {
      const item = { ...draft, title: draft.title.trim(), description: draft.description.trim(), stock: draft.kind === "physical" ? Math.max(draft.reserved, draft.stock ?? 1) : null, shipping };
      const result = await apiJson<{ item: CatalogItem }>("/api/items", { method: "POST", body: JSON.stringify({ item }) });
      const items = data.items.some(current => current.id === result.item.id) ? data.items.map(current => current.id === result.item.id ? result.item : current) : [...data.items, result.item];
      onData({ ...data, items });
      setDraft(null);
      toast(locale === "ru" ? "Предложение сохранено" : "Offer saved");
    } catch (error) { toast(toErrorMessage(error)); }
  };

  return <SubpageHeading locale={locale} title="catalog" subtitle={locale === "ru" ? "Услуги, материалы и товары живут рядом со страницей." : "Services, resources and products live beside your page."}><div className="data-card"><div className="data-card-head"><h2>{t(locale, "tabCatalog")}</h2><button type="button" className="button button-primary" onClick={openNew}><Icon name="Plus" size={15} />{t(locale, "addItem")}</button></div><div className="data-list">{data.items.length ? data.items.map(item => <div className="data-row" key={item.id}><div className="data-row-title"><strong>{item.title}</strong><span>{t(locale, item.kind)} · {formatMoney(item.price, item.currency, locale)}{item.stock !== null ? " · " + t(locale, "stock") + ": " + item.stock : ""}</span></div><div className="data-row-actions"><span className={"status-chip " + (item.kind === "service" ? "green" : "")}>{item.kind === "service" ? t(locale, "bookings") : item.kind === "physical" && !item.shipping.length ? t(locale, "requiresSetup") : t(locale, "published")}</span><button type="button" className="button button-quiet" onClick={() => openEdit(item)} aria-label={(locale === "ru" ? "Изменить " : "Edit ") + item.title}><Icon name="Pencil" size={14} />{t(locale, "change")}</button></div></div>) : <div className="empty-state">{t(locale, "emptyCatalog")}</div>}</div></div>{draft && <EditorDialog title={data.items.some(item => item.id === draft.id) ? (locale === "ru" ? "Изменить предложение" : "Edit offer") : t(locale, "newItem")} description={locale === "ru" ? "Настройте содержание, цену и условия, которые увидит покупатель." : "Set the content, price and terms buyers will see."} closeLabel={t(locale, "close")} onClose={() => setDraft(null)}><div className="modal-form"><label className="field"><span className="side-label">{t(locale, "title")}</span><input maxLength={200} value={draft.title} onChange={event => update({ title: event.target.value })} autoFocus /></label><label className="field"><span className="side-label">{t(locale, "description")}</span><textarea maxLength={20000} value={draft.description} onChange={event => update({ description: event.target.value })} /></label><label className="field"><span className="side-label">{t(locale, "type")}</span><select value={draft.kind} onChange={event => { const kind = event.target.value as CatalogItem["kind"]; update({ kind, stock: kind === "physical" ? draft.stock ?? 1 : null, shipping: kind === "physical" ? draft.shipping : [] }); if (kind !== "physical") setShippingText(""); }}><option value="service">{t(locale, "service")}</option><option value="digital">{t(locale, "digital")}</option><option value="physical">{t(locale, "physical")}</option><option value="ticket">{t(locale, "ticket")}</option></select></label><div className="form-grid"><label className="field"><span className="side-label">{t(locale, "price")} · {draft.currency}</span><input type="number" min="0.01" step="0.01" value={draft.price / 100} onChange={event => update({ price: Math.round(Number(event.target.value || 0) * 100) })} /></label>{draft.kind === "physical" && <label className="field"><span className="side-label">{t(locale, "stock")}</span><input type="number" min={draft.reserved} step="1" value={draft.stock ?? 1} onChange={event => update({ stock: Math.max(draft.reserved, Math.floor(Number(event.target.value || 0))) })} /></label>}</div>{draft.kind === "physical" && <label className="field"><span className="side-label">{t(locale, "shipping")}</span><input value={shippingText} onChange={event => setShippingText(event.target.value)} placeholder={locale === "ru" ? "KZ: 0, RU: 5" : "KZ: 0, RU: 5"} aria-describedby="shipping-help" /><span id="shipping-help" className="small muted">{locale === "ru" ? "Коды ISO через запятую; сумма доставки — в валюте товара." : "ISO country codes separated by commas; amounts use the item currency."}</span></label>}{draft.kind === "digital" && <label className="field"><span className="side-label">File ID</span><input value={draft.fileId ?? ""} onChange={event => update({ fileId: event.target.value || undefined })} placeholder={locale === "ru" ? "Идентификатор загруженного файла" : "Uploaded file identifier"} /></label>}{draft.kind === "physical" && !parseShipping(shippingText).length && <div className="notice error-notice" role="alert"><Icon name="Info" size={16} />{t(locale, "noShipping")}</div>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setDraft(null)}>{t(locale, "cancel")}</button><button type="button" className="button button-primary" onClick={() => void save()}>{t(locale, "save")}</button></div></div></EditorDialog>}</SubpageHeading>;
}

function SettingsView({ data, locale, onData, onPage, toast }: { data: DashboardData; locale: Locale; onData: (data: DashboardData) => void; onPage: (page: Page) => void; toast: (message: string) => void }) {
  const [telegram, setTelegram] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [pairUrl, setPairUrl] = useState("");
  const [calLink, setCalLink] = useState(data.integration.calLink);
  const [calKey, setCalKey] = useState("");
  const [stripeBusy, setStripeBusy] = useState(false);

  useEffect(() => { apiJson<{ configured: boolean; connected: boolean }>("/api/integrations/telegram").then(setTelegram).catch(() => setTelegram({ configured: false, connected: false })); }, []);

  const pair = async () => {
    try { const result = await apiJson<{ url: string }>("/api/integrations/telegram", { method: "POST", body: "{}" }); setPairUrl(result.url); toast(locale === "ru" ? "Ссылка для подключения готова" : "Pairing link ready"); }
    catch (error) { toast(toErrorMessage(error, t(locale, "requiresSetup"))); }
  };
  const connectCal = async () => {
    try { const result = await apiJson<{ connected: boolean; calLink: string }>("/api/integrations/cal", { method: "POST", body: JSON.stringify({ apiKey: calKey, calLink }) }); onData({ ...data, integration: { ...data.integration, calConnected: result.connected, calLink: result.calLink } }); toast(result.connected ? t(locale, "connected") : t(locale, "requiresSetup")); }
    catch (error) { toast(toErrorMessage(error)); }
  };
  const connectStripe = async () => {
    if (data.demo) { toast(locale === "ru" ? "Stripe подключается только в рабочем режиме." : "Stripe connects only in live workspace mode."); return; }
    setStripeBusy(true);
    try { const result = await apiJson<{ url: string }>("/api/integrations/stripe/connect", { method: "POST", body: "{}" }); window.location.assign(result.url); }
    catch (error) { setStripeBusy(false); toast(toErrorMessage(error, t(locale, "requiresSetup"))); }
  };

  return <SubpageHeading locale={locale} title="settings" subtitle={locale === "ru" ? "Настройте страницу и каналы, когда будете готовы." : "Set up your page and channels when you're ready."}><div className="settings-grid"><div className="settings-card"><h2>{locale === "ru" ? "Страница" : "Page"}</h2><p>{t(locale, "wholePageHelp")}</p><PageSettings page={data.page} locale={locale} onUpdate={onPage} /></div><div className="settings-card"><h2>{t(locale, "tabConnections")}</h2><p>{locale === "ru" ? "Подключения остаются на стороне сервера. Демо ничего не отправляет наружу." : "Connections stay server-side. Demo never sends anything externally."}</p><div className="integration-row"><div><strong>Stripe Connect</strong><span>{data.integration.stripeReady ? t(locale, "paymentReady") : t(locale, "requiresSetup")}</span></div><button type="button" className="button button-secondary" onClick={() => void connectStripe()} disabled={stripeBusy || data.integration.stripeReady}>{data.integration.stripeReady ? t(locale, "connected") : t(locale, "connect")}</button></div><div className="integration-row"><div><strong>Cal.com</strong><span>{data.integration.calConnected ? data.integration.calLink : t(locale, "bookingUnavailable")}</span></div><span className={"status-chip " + (data.integration.calConnected ? "green" : "")}>{data.integration.calConnected ? t(locale, "connected") : t(locale, "notConnected")}</span></div><div className="side-section"><label className="field"><span className="side-label">{locale === "ru" ? "Ссылка Cal.com" : "Cal.com link"}</span><input value={calLink} onChange={event => setCalLink(event.target.value)} placeholder="https://cal.com/name/session" /></label><label className="field"><span className="side-label">API key {locale === "ru" ? "(резервный способ)" : "(fallback)"}</span><input type="password" value={calKey} onChange={event => setCalKey(event.target.value)} autoComplete="off" /></label><button type="button" className="button button-secondary" onClick={() => void connectCal()}>{t(locale, "connect")}</button></div><div className="integration-row"><div><strong>Telegram</strong><span>{telegram?.connected ? t(locale, "connected") : t(locale, "notConnected")}</span></div><button type="button" className="button button-secondary" onClick={() => void pair()}>{telegram?.connected ? t(locale, "connected") : t(locale, "connect")}</button></div>{pairUrl && <div className="notice"><Icon name="MessageCircle" size={16} /><span>{locale === "ru" ? "Откройте ссылку в Telegram на этом устройстве:" : "Open this link in Telegram on this device:"}<br /><a href={pairUrl} target="_blank" rel="noreferrer">{pairUrl}</a></span></div>}</div></div></SubpageHeading>;
}

function SubpageHeading({ locale, title, subtitle, children }: { locale: Locale; title: MessageKey | "catalog"; subtitle: string; children: React.ReactNode }) { return <div className="subpage"><div className="subpage-heading"><div><div className="eyebrow">PAGER workspace</div><h1>{t(locale, title)}</h1><p>{subtitle}</p></div></div>{children}</div>; }

export function CreatorScreen({ canAdmin = false, demoEnabled = false }: { canAdmin?: boolean; demoEnabled?: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("page");
  const [toastMessage, setToastMessage] = useState("");
  const [saveState, setSaveState] = useState<DraftState>({ status: "saved" });
  const writerRef = useRef<DraftWriter | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    apiJson<DashboardData>("/api/dashboard").then(value => {
      if (!active) return;
      writerRef.current = new DraftWriter(
        value.page,
        async page => (await apiJson<{ page: Page }>("/api/page", { method: "PUT", body: JSON.stringify({ page }) })).page,
        page => { if (active) setData(current => current ? { ...current, page } : current); },
        state => { if (active) { setSaveState(state); if (state.error) setToastMessage(state.error); } },
      );
      setData(value);
    }).catch(error => { if (!active) return; if (error instanceof ApiClientError && error.status === 401) { setData(null); setLoadError(""); } else { setData(null); setLoadError(toErrorMessage(error, "Не удалось загрузить кабинет. Повторите попытку.")); } }).finally(() => { if (active) setLoading(false); });
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (writerRef.current?.dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => {
      active = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      window.removeEventListener("beforeunload", protectDraft);
      writerRef.current = null;
    };
  }, []);

  const locale = data?.page.locale ?? "ru";
  usePlatformLocale(locale);
  const clearSaveTimer = () => {
    if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = undefined; }
  };
  const editPage = (page: Page) => {
    const writer = writerRef.current;
    if (!writer) return;
    writer.edit(page);
    clearSaveTimer();
    saveTimer.current = window.setTimeout(() => { saveTimer.current = undefined; void writer.flush(); }, 850);
  };
  const flushDraft = () => { clearSaveTimer(); return writerRef.current?.flush() ?? Promise.resolve(true); };
  const retrySave = () => {
    const writer = writerRef.current;
    if (writer && !writer.dirty && writer.state.status === "error") writer.edit(writer.page);
    void flushDraft();
  };
  // Catalog/integration responses may have captured an older page. Only the
  // serialized writer is allowed to replace the current local page.
  const updateResources = (next: DashboardData) => setData(current => current ? { ...next, page: current.page } : next);
  const signOut = async () => {
    const saved = await flushDraft();
    if (!saved && !window.confirm(locale === "ru" ? "Черновик не сохранён. Всё равно выйти?" : "Your draft is not saved. Sign out anyway?")) return;
    await apiJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/");
  };
  const publish = async () => {
    const writer = writerRef.current;
    if (!writer) return;
    clearSaveTimer();
    const ok = await writer.publish(async revision => (await apiJson<{ page: Page }>("/api/page/publish", {
      method: "POST", body: JSON.stringify({ expectedRevision: revision }),
    })).page);
    if (ok) setToastMessage(t(locale, "publishSuccess"));
  };
  const reloadDraft = async () => {
    const writer = writerRef.current;
    if (!writer) return;
    if (writer.dirty && !window.confirm(locale === "ru" ? "Заменить несохранённый черновик версией сервера?" : "Replace your unsaved draft with the server version?")) return;
    const local = writer.page;
    try {
      const value = await apiJson<DashboardData>("/api/dashboard");
      if (writer.page !== local) {
        setToastMessage(locale === "ru" ? "Вы продолжили редактирование. Новые изменения оставлены в этом окне." : "You continued editing. Your newer changes are kept in this window.");
        return;
      }
      clearSaveTimer(); writer.replace(value.page); setData(value);
    } catch (error) { setToastMessage(toErrorMessage(error)); }
  };
  const leaveWorkspace = (destination: () => string) => {
    clearSaveTimer();
    return navigateAfterDraftSave(writerRef.current, () => router.push(destination()));
  };
  const openPage = () => leaveWorkspace(() => "/" + (writerRef.current?.page.slug ?? data?.page.slug ?? ""));

  if (loading) return <div className="app-background screen"><Loading label="Загружаем кабинет…" /></div>;
  if (!data) return loadError ? <WorkspaceError message={loadError} /> : <DemoGate role="creator" demoEnabled={demoEnabled} />;
  return <div lang={locale} className="creator-layout app-background">
    <ShellNav locale={locale} active={view} onNavigate={setView} onSignOut={() => void signOut()} onOpenAdmin={() => { void leaveWorkspace(() => "/admin"); }} canAdmin={canAdmin} />
    <main className="creator-main">
      <TopBar data={data} locale={locale} onOpenPage={() => void openPage()} onSignOut={() => void signOut()} />
      {data.demo && <div className="notice"><Icon name="Info" size={16} /><span><strong>{t(locale, "demo")}</strong> · {t(locale, "demoHelp")}</span></div>}
      {view === "page" && <EditorPageView data={data} locale={locale} onPage={editPage} publish={publish} saveState={saveState} retry={retrySave} reload={() => void reloadDraft()} />}
      {view === "clients" && <ClientsView data={data} locale={locale} toast={setToastMessage} />}
      {view === "orders" && <OrdersView data={data} locale={locale} onData={updateResources} toast={setToastMessage} />}
      {view === "analytics" && <AnalyticsPanel locale={locale} demo={data.demo} />}
      {view === "catalog" && <CatalogView data={data} locale={locale} onData={updateResources} toast={setToastMessage} />}
      {view === "settings" && <>
        <SaveStatus state={saveState} locale={locale} retry={retrySave} reload={() => void reloadDraft()} />
        <SettingsView data={data} locale={locale} onData={updateResources} onPage={editPage} toast={setToastMessage} />
        <PageReadiness page={data.page} locale={locale} />
      </>}
    </main>
    {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage("")} />}
  </div>;
}

export function HomeScreen({ locale = "ru", demoEnabled = false, creatorSignup = false }: { locale?: Locale; demoEnabled?: boolean; creatorSignup?: boolean }) { return <DemoGate role="creator" locale={locale} demoEnabled={demoEnabled} creatorSignup={creatorSignup} />; }
