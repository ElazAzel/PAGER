"use client";

import { useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnalyticsAction, CatalogItem, PublicBlock, PublicPage, User } from "@/lib/types";
import { accessOfferOptions, type AccessOfferMode, type ConfirmedBookingResult } from "@/lib/commerce";
import { formatMoney } from "@/lib/blocks";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { BlockRenderer } from "./block-renderer";
import { AppearanceSurface } from "./appearance-surface";
import { Icon } from "./pager-icon";
import { apiJson, toErrorMessage } from "./api";
import { bookingBlockForItem, publicAction, trafficDevice, trafficSource } from "@/lib/public-discovery";
import styles from "./public-conversion.module.css";
import { BookingPicker } from "./booking-picker";
import { AccessOfferButtons } from "./access-offers";
import { authPayload, authVerificationPayload, type LoginRole } from "@/lib/auth-intent";
import { LocaleSwitch } from "./locale-switch";
import { usePlatformLocale } from "./platform-preferences";

function Loading({ label = "Загрузка…" }: { label?: string }) { return <div className="empty-state" role="status" aria-live="polite"><Icon name="Activity" size={18} /> <span>{label}</span></div>; }

type FocusReturnRef = MutableRefObject<HTMLElement | null>;

function Modal({ title, description, closeLabel = "Close", onClose, children, wide = false, restoreFocusRef }: { title: string; description?: string; closeLabel?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; restoreFocusRef?: FocusReturnRef }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = restoreFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])")).filter(element => !element.hasAttribute("disabled"));
    (focusable[0] ?? dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || focusable.length < 2) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); if (previousFocus && document.contains(previousFocus)) previousFocus.focus(); };
  }, [onClose, restoreFocusRef]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className={"modal " + (wide ? "modal-wide" : "")} role="dialog" aria-modal="true" aria-label={title} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}><div className="modal-handle" /><div className="modal-heading"><div><h2>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label={closeLabel}><Icon name="X" /></button></div>{children}</div></div>;
}

export function AuthModal({ locale, onLocaleChange, role = "buyer", demoEnabled = false, onClose, onComplete, restoreFocusRef }: { locale: Locale; onLocaleChange?: (locale: Locale) => void; role?: LoginRole; demoEnabled?: boolean; onClose: () => void; onComplete: (user: User) => void; restoreFocusRef?: FocusReturnRef }) {
  const [email, setEmail] = useState(""); const [token, setToken] = useState(""); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const sendCode = async () => { setBusy(true); setError(""); try { await apiJson("/api/auth/otp", { method: "POST", body: JSON.stringify(authPayload(email, locale, role)) }); setSent(true); } catch (err) { setError(toErrorMessage(err)); } finally { setBusy(false); } };
  const verify = async () => { setBusy(true); setError(""); try { const result = await apiJson<{ user: User }>("/api/auth/verify", { method: "POST", body: JSON.stringify(authVerificationPayload(email, token, role)) }); onComplete(result.user); } catch (err) { setError(toErrorMessage(err)); } finally { setBusy(false); } };
  const demo = async () => { setBusy(true); setError(""); try { const result = await apiJson<{ user: User }>("/api/demo/session", { method: "POST", body: JSON.stringify({ role, identity: "primary" }) }); onComplete(result.user); } catch (err) { setError(toErrorMessage(err, locale === "ru" ? "Демо доступно только локально." : "Demo is available locally only.")); } finally { setBusy(false); } };
  const creator = role === "creator";
  const title = creator ? (locale === "ru" ? "Создайте страницу в PAGER" : "Create your PAGER page") : t(locale, "otpTitle");
  const description = creator ? (locale === "ru" ? "Пришлём код на email. После входа откроется кабинет автора." : "We'll email you a code. After sign-in, your creator workspace will open.") : t(locale, "otpHelp");
  return <Modal title={title} description={description} closeLabel={t(locale, "close")} onClose={onClose} restoreFocusRef={restoreFocusRef}><div className="modal-form">{onLocaleChange && <LocaleSwitch locale={locale} onChange={onLocaleChange} />}{!sent ? <><label className="field"><span className="side-label">{t(locale, "email")}</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoFocus /></label><button type="button" className="button button-primary" onClick={sendCode} disabled={busy || !email}>{t(locale, "continue")}</button></> : <><div className="notice"><Icon name="Mail" size={16} />{t(locale, "otpSent")}</div><label className="field"><span className="side-label">{t(locale, "otpCode")}</span><input inputMode="numeric" autoComplete="one-time-code" value={token} onChange={event => setToken(event.target.value)} /></label><button type="button" className="button button-primary" onClick={verify} disabled={busy || !token}>{t(locale, "otpVerify")}</button></>}{demoEnabled && <button type="button" className="button button-secondary" onClick={demo} disabled={busy}>{creator ? t(locale, "demoCreator") : t(locale, "demoBuyer")}</button>}{error && <div className="notice error-notice" role="alert"><Icon name="Info" size={16} />{error}</div>}</div></Modal>;
}

function LeadModal({ page, block, locale, onClose, onDone, onTrack, restoreFocusRef }: { page: PublicPage; block: PublicBlock; locale: Locale; onClose: () => void; onDone: (message: string) => void; onTrack?: () => void; restoreFocusRef?: FocusReturnRef }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async () => { setBusy(true); setError(""); try { await apiJson("/api/leads", { method: "POST", body: JSON.stringify({ pageId: page.id, blockId: block.id, name, email, message }) }); onTrack?.(); onDone(t(locale, "requestSent")); } catch (err) { setError(toErrorMessage(err)); } finally { setBusy(false); } };
  return <Modal title={block.type === "event" ? (block.data?.title || "Event") : (block.data?.title || t(locale, "application"))} description={block.type === "event" ? (locale === "ru" ? "Оставьте email, чтобы попасть в список участников." : "Leave your email to join the attendee list.") : (block.data?.text || "")} closeLabel={t(locale, "close")} onClose={onClose} restoreFocusRef={restoreFocusRef}><div className="modal-form"><label className="field"><span className="side-label">{t(locale, "name")}</span><input value={name} onChange={event => setName(event.target.value)} placeholder={t(locale, "namePlaceholder")} /></label><label className="field"><span className="side-label">{t(locale, "email")}</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label className="field"><span className="side-label">{t(locale, "message")}</span><textarea value={message} onChange={event => setMessage(event.target.value)} /></label><button type="button" className="button button-primary" onClick={submit} disabled={busy || !name || !email}>{block.type === "event" ? (locale === "ru" ? "Зарегистрироваться" : "Register") : t(locale, "send")}</button>{error && <div className="notice error-notice" role="alert"><Icon name="Info" size={16} />{error}</div>}</div></Modal>;
}

type ShippingAddress = { name: string; line1: string; city: string; postalCode: string; country: string };

function ShippingModal({ item, locale, onClose, onSubmit, restoreFocusRef }: { item: CatalogItem; locale: Locale; onClose: () => void; onSubmit: (address: ShippingAddress, quantity: number) => Promise<void>; restoreFocusRef?: FocusReturnRef }) {
  const [name, setName] = useState(""); const [line1, setLine1] = useState(""); const [city, setCity] = useState(""); const [postalCode, setPostalCode] = useState(""); const [country, setCountry] = useState(item.shipping[0]?.country ?? ""); const [quantity, setQuantity] = useState(1); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const shipping = item.shipping.find(option => option.country === country); const maxQuantity = item.stock === null ? 100 : Math.max(1, Math.min(100, item.stock)); const ru = locale === "ru";
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!name.trim() || !line1.trim() || !city.trim() || !postalCode.trim() || !country || !shipping) { setError(ru ? "Заполните адрес и выберите доступную страну доставки." : "Complete the address and choose an available shipping country."); return; } setBusy(true); setError(""); try { await onSubmit({ name: name.trim(), line1: line1.trim(), city: city.trim(), postalCode: postalCode.trim(), country }, quantity); } catch (err) { setError(toErrorMessage(err)); } finally { setBusy(false); } };
  return <Modal title={ru ? "Адрес доставки" : "Shipping address"} description={ru ? "Доставка добавится к сумме заказа перед оплатой." : "Shipping is added to the order total before payment."} closeLabel={t(locale, "close")} onClose={onClose} restoreFocusRef={restoreFocusRef}><form className="modal-form" onSubmit={submit}><label className="field"><span className="side-label">{t(locale, "name")}</span><input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required /></label><label className="field"><span className="side-label">{t(locale, "address")}</span><input value={line1} onChange={event => setLine1(event.target.value)} autoComplete="street-address" required /></label><div className="form-grid"><label className="field"><span className="side-label">{t(locale, "city")}</span><input value={city} onChange={event => setCity(event.target.value)} autoComplete="address-level2" required /></label><label className="field"><span className="side-label">{t(locale, "postalCode")}</span><input value={postalCode} onChange={event => setPostalCode(event.target.value)} autoComplete="postal-code" required /></label></div><label className="field"><span className="side-label">{t(locale, "country")}</span><select value={country} onChange={event => setCountry(event.target.value)} required disabled={!item.shipping.length}><option value="">{ru ? "Выберите страну" : "Choose a country"}</option>{item.shipping.map(option => <option key={option.country} value={option.country}>{option.country} · {formatMoney(option.amount, item.currency, locale)}</option>)}</select></label><label className="field"><span className="side-label">{t(locale, "quantity")}</span><input type="number" min={1} max={maxQuantity} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(maxQuantity, Number(event.target.value) || 1)))} required /></label>{shipping && <div className="notice"><Icon name="Truck" size={16} />{ru ? "Доставка" : "Shipping"}: {formatMoney(shipping.amount, item.currency, locale)}</div>}{!item.shipping.length && <div className="notice error-notice" role="alert"><Icon name="Info" size={16} />{t(locale, "noShipping")}</div>}<button className="button button-primary" type="submit" disabled={busy || !item.shipping.length}>{ru ? "Перейти к оплате" : "Continue to payment"}</button>{error && <div className="notice error-notice" role="alert"><Icon name="Info" size={16} />{error}</div>}</form></Modal>;
}

function BookingModal({ page, block, item, locale, user, onClose, onDone, onTrack, restoreFocusRef }: { page: PublicPage; block: PublicBlock; item?: CatalogItem; locale: Locale; user?: User; onClose: () => void; onDone: (result: ConfirmedBookingResult) => void; onTrack?: () => void; restoreFocusRef?: FocusReturnRef }) {
  return <Modal title={block.data?.title || t(locale, "chooseTime")} description={block.data?.text || t(locale, "bookingPaidHelp")} closeLabel={t(locale, "close")} onClose={onClose} restoreFocusRef={restoreFocusRef}><BookingPicker pageId={page.id} slug={page.slug} blockId={block.id} itemId={item?.id} locale={locale} demo={page.demo} authenticated={Boolean(user)} name={user?.name} email={user?.email} onBooked={result => { if (result.booking.status === "confirmed") onTrack?.(); onDone(result); }} /></Modal>;
}

function usePublicAnalytics(page: PublicPage | null) {
  const context = useRef<{ pageId: string; visitorId: string; source: ReturnType<typeof trafficSource>; device: ReturnType<typeof trafficDevice> } | null>(null);
  const viewEvent = useRef<{ pageId: string; eventId: string } | null>(null);
  const track = (kind: "view" | "click", blockId?: string, action?: AnalyticsAction) => {
    const current = context.current;
    if (!current || page?.owner) return;
    // Teaser purchase intent has its own endpoint-validated action; it never grants access.
    if (kind === "click" && !action && (!blockId || page?.locked || !page?.blocks.some(block => block.id === blockId && !block.locked && !block.hidden && !block.archived))) return;
    if (action === "page_access" && (!page?.paid || !page.locked)) return;
    if (action === "block_access" && (page?.locked || !page?.blocks.some(block => block.id === blockId && block.paid && block.locked && !block.hidden && !block.archived))) return;
    void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", keepalive: true, body: JSON.stringify({ ...current, kind, blockId, action, eventId: crypto.randomUUID() }) }).catch(() => {});
  };
  const pageId = page?.id;
  useEffect(() => {
    if (!pageId || navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    const key = `pager:visit:${pageId}`;
    let visitorId: string;
    try { visitorId = sessionStorage.getItem(key) || crypto.randomUUID(); sessionStorage.setItem(key, visitorId); }
    catch { visitorId = crypto.randomUUID(); }
    context.current = { pageId, visitorId, source: trafficSource(document.referrer, window.location.origin), device: trafficDevice(navigator.userAgent, navigator.maxTouchPoints) };
    if (viewEvent.current?.pageId !== pageId) viewEvent.current = { pageId, eventId: crypto.randomUUID() };
    // Effect replay reuses this event ID; a fresh visit/reload gets its own event.
    void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", keepalive: true, body: JSON.stringify({ ...context.current, kind: "view", eventId: viewEvent.current.eventId }) }).catch(() => {});
    return () => { context.current = null; };
  }, [pageId]);
  return track;
}

function PublicTop({ locale, user, onAuth }: { locale: Locale; user: User | null; onAuth: () => void }) { return <div className="public-top"><Link href="/" className="wordmark">PAGER<span>.</span></Link><div className="public-top-right">{user ? <span className="status-chip green">{user.name}</span> : <button type="button" className="button button-secondary" onClick={onAuth}><Icon name="Mail" size={14} />{t(locale, "signIn")}</button>}</div></div>; }

export function PublicPageScreen({ slug, initialPage, initialItems = [] }: { slug: string; initialPage: PublicPage; initialItems?: CatalogItem[] }) {
  const router = useRouter(); const [page, setPage] = useState<PublicPage>(initialPage); const [items, setItems] = useState<CatalogItem[]>(initialItems); const [user, setUser] = useState<User | null>(null); const [modal, setModal] = useState<"auth" | "lead" | "booking" | "shipping" | null>(null); const [activeBlock, setActiveBlock] = useState<PublicBlock | null>(null); const [activeItem, setActiveItem] = useState<CatalogItem | undefined>(); const [toast, setToast] = useState(""); const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const rememberModalTrigger = (event: React.SyntheticEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element) || event.target.closest('[role="dialog"]')) return;
    const control = event.target.closest<HTMLElement>('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (control) returnFocusRef.current = control;
  };
  const track = usePublicAnalytics(page);
  const load = async () => { try { const [publicData, session] = await Promise.all([apiJson<{ page: PublicPage; items: CatalogItem[] }>(`/api/public/${encodeURIComponent(slug)}`), apiJson<{ user: User | null }>("/api/session")]); setPage(publicData.page); setItems(publicData.items); setUser(session.user); return true; } catch (error) { setPage(current => ({ ...current, owner: false, locked: true, description: current.teaser, blocks: [] })); setItems([]); setUser(null); setToast(toErrorMessage(error)); return false; } };
  useEffect(() => { let active = true; const request = async () => { try { const session = await apiJson<{ user: User | null }>("/api/session"); if (active) setUser(session.user); if (session.user) { const publicData = await apiJson<{ page: PublicPage; items: CatalogItem[] }>(`/api/public/${encodeURIComponent(slug)}`); if (active) { setPage(publicData.page); setItems(publicData.items); } } } catch (error) { if (active) setToast(toErrorMessage(error)); } }; void request(); return () => { active = false; }; }, [slug]);
  const locale = page?.locale ?? "ru";
  usePlatformLocale(locale);
  const finishAuth = (nextUser: User) => { setUser(nextUser); setModal(null); const action = pendingAction; setPendingAction(null); void load().then(ok => { if (ok) action?.(); }); };
  const needBuyer = (action?: () => void) => { if (!user || user.role !== "buyer") { if (action) setPendingAction(() => action); setModal("auth"); return false; } return true; };
  const checkout = async (input: Record<string, unknown>) => { try { const result = await apiJson<{ url: string; orderId: string; demo: boolean }>("/api/checkout", { method: "POST", body: JSON.stringify(input) }); if (result.demo || result.url.startsWith("/")) router.push(result.url); else window.location.assign(result.url); return true; } catch (error) { setToast(toErrorMessage(error)); return false; } };
  const unlockPage = (mode: AccessOfferMode) => { const action = () => { void checkout({ pageId: page?.id, scope: "page", mode }); }; if (needBuyer(action)) action(); };
  const primaryAction = publicAction(page, items);
  const openBooking = (item: CatalogItem | undefined, source: PublicBlock) => {
    const booking = source.type === "booking" && !source.locked && !source.hidden && !source.archived && (!item || source.data?.itemIds?.includes(item.id)) ? source : item ? bookingBlockForItem(page, item.id) : undefined;
    if (!booking) return;
    const action = () => { track("click", booking.id, "booking_start"); setActiveBlock(booking); setActiveItem(item); setModal("booking"); }; if (needBuyer(action)) action();
  };
  const activatePrimary = () => { if (!primaryAction) return; if (primaryAction.kind === "booking") openBooking(primaryAction.item, primaryAction.block); else { track("click", primaryAction.block.id, "form_open"); setActiveBlock(primaryAction.block); setModal("lead"); } };
  const pageLocked = Boolean(page.locked);
  return <AppearanceSurface lang={locale} appearance={page.appearance} accent={page.accent} className={`public-wrap app-background ${styles.publicRoot} ${primaryAction ? styles.withAction : ""}`} onPointerDownCapture={rememberModalTrigger} onFocusCapture={rememberModalTrigger}>
    <PublicTop locale={locale} user={user} onAuth={() => setModal("auth")} />
    <main className="public-page">
      <header className="public-profile"><div className="avatar avatar-lg" aria-hidden="true">{page.title.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("")}</div><h1>{page.title}</h1><p>{page.description}</p>
        {primaryAction && <div className={styles.heroAction}><button className="button button-primary" onClick={activatePrimary}><Icon name={primaryAction.kind === "booking" ? "CalendarDays" : "Send"} size={17} />{primaryAction.label}</button>{primaryAction.item && <span>{formatMoney(primaryAction.item.price, primaryAction.item.currency, locale)}</span>}</div>}
        {page.demo && <div className={styles.demoNotice}><span className="demo-pill">{t(locale, "demo")}</span><p>{t(locale, "demoHelp")}</p></div>}
      </header>
      {pageLocked ? <section className="page-access-card"><div className="lock-icon"><Icon name="LockKeyhole" size={19} /></div><div><div className="eyebrow">{t(locale, "wholePage")}</div><h2>{locale === "ru" ? "Откройте всю страницу" : "Unlock the full page"}</h2><p>{page.teaser || t(locale, "wholePageHelp")}</p><div className="block-cta"><AccessOfferButtons pricing={page.pricing} locale={locale} onSelect={mode => { track("click", undefined, "page_access"); unlockPage(mode); }} /></div></div></section> :
        <div className="public-blocks">{page.blocks.map((block, index) => <BlockRenderer key={block.id} block={block} locale={locale} slug={page.slug} items={items} appearance={page.appearance} sequence={index}
          onAction={source => track("click", source.id)}
          bookingOrigin={item => bookingBlockForItem(page, item.id)}
          onBuyBlock={(source, mode) => { track("click", source.id, "block_access"); const selectedMode = mode ?? accessOfferOptions(source.pricing)[0]?.mode ?? "one_time"; const action = () => { void checkout({ pageId: page.id, scope: "block", blockId: source.id, mode: selectedMode }); }; if (needBuyer(action)) action(); }}
          onItemBuy={(item, source) => { const action = () => { if (item.kind === "physical") { setActiveItem(item); setActiveBlock(source as PublicBlock); setModal("shipping"); return; } void checkout({ pageId: page.id, scope: "item", itemId: item.id, blockId: source.id, mode: "one_time", quantity: 1 }); }; if (needBuyer(action)) action(); }}
          onBook={(item, source) => openBooking(item, source as PublicBlock)}
          onLead={source => { track("click", (source as PublicBlock).id, "form_open"); setActiveBlock(source as PublicBlock); setModal("lead"); }} />)}</div>}
      <noscript><p className={styles.noScript}>{locale === "ru" ? "Вы можете прочитать страницу и открыть ссылки. Для записи и оплаты включите JavaScript." : "You can read this page and follow links. Enable JavaScript to book or pay."}</p></noscript>
      <footer className="public-footer"><span>Built with PAGER</span><button className="icon-button" onClick={() => setModal("auth")} aria-label={t(locale, "signIn")}><Icon name="ArrowRight" size={16} /></button></footer>
    </main>
    {primaryAction && !modal && <aside className={`appearance-action-dock ${styles.actionDock}`} aria-label={locale === "ru" ? "Связаться с автором" : "Contact the creator"}><div><strong>{primaryAction.item?.title || page.title}</strong><span>{primaryAction.item ? formatMoney(primaryAction.item.price, primaryAction.item.currency, locale) : (primaryAction.kind === "booking" ? t(locale, "chooseTime") : t(locale, "application"))}</span></div><button className="button button-primary" onClick={activatePrimary}>{primaryAction.label}<Icon name="ArrowUpRight" size={17} /></button></aside>}
    {modal === "auth" && <AuthModal locale={locale} demoEnabled={page.capabilities?.demo === true} onClose={() => { setPendingAction(null); setModal(null); }} onComplete={finishAuth} restoreFocusRef={returnFocusRef} />}
   {modal === "lead" && activeBlock && <LeadModal page={page} block={activeBlock} locale={locale} onClose={() => setModal(null)} onTrack={() => track("click", activeBlock.id, "form_submit")} onDone={message => { setModal(null); setToast(message); void load(); }} restoreFocusRef={returnFocusRef} />}
    {modal === "shipping" && activeItem && <ShippingModal item={activeItem} locale={locale} onClose={() => setModal(null)} onSubmit={async (shippingAddress, quantity) => { const ok = await checkout({ pageId: page.id, scope: "item", blockId: activeBlock?.id, mode: "one_time", quantity, country: shippingAddress.country, shippingAddress }); if (ok) setModal(null); }} restoreFocusRef={returnFocusRef} />}
    {modal === "booking" && activeBlock && <BookingModal page={page} block={activeBlock} item={activeItem} locale={locale} user={user ?? undefined} onClose={() => setModal(null)} onTrack={() => track("click", activeBlock.id, "booking_confirmed")} onDone={result => { if (result.bookingUrl) { window.location.assign(result.bookingUrl); return; } setModal(null); setToast(t(locale, "bookingConfirmed")); if (result.orderId) router.push(`/checkout/${result.orderId}`); else void load(); }} restoreFocusRef={returnFocusRef} />}
    {toast && <div className="toast" role="status"><Icon name="Check" size={15} />{toast}<button className="icon-button" onClick={() => setToast("")} aria-label={t(locale, "close")}><Icon name="X" size={13} /></button></div>}
  </AppearanceSurface>;
}

export function ItemDetailScreen({ slug, itemId, initialPage, initialItem, initialBlockId = "" }: { slug: string; itemId: string; initialPage?: PublicPage; initialItem?: CatalogItem; initialBlockId?: string }) {
  const router = useRouter(); const [item, setItem] = useState<CatalogItem | null>(initialItem ?? null); const [page, setPage] = useState<PublicPage | null>(initialPage ?? null); const [blockId, setBlockId] = useState(initialBlockId); const [user, setUser] = useState<User | null>(null); const [error, setError] = useState(""); const [shippingOpen, setShippingOpen] = useState(false);
  const shippingFocusRef = useRef<HTMLElement | null>(null);
  const rememberShippingTrigger = (event: React.SyntheticEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element) || event.target.closest('[role="dialog"]')) return;
    const control = event.target.closest<HTMLElement>('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (control) shippingFocusRef.current = control;
  };
  const track = usePublicAnalytics(page);
  useEffect(() => { let active = true; const load = async () => { try { const session = await apiJson<{ user: User | null }>("/api/session"); if (active) setUser(session.user); if (session.user || !initialItem) { const result = await apiJson<{ item: CatalogItem; page: PublicPage; blockId: string }>(`/api/public/${encodeURIComponent(slug)}/items/${encodeURIComponent(itemId)}?blockId=${encodeURIComponent(initialBlockId)}`); if (active) { setBlockId(result.blockId); setItem(result.item); setPage(result.page); } } } catch (err) { if (active) setError(toErrorMessage(err)); } }; void load(); return () => { active = false; }; }, [slug, itemId, initialBlockId, initialItem]);
  usePlatformLocale(page?.locale ?? "ru");
  if (error) return <div className="app-background screen"><div className="empty-state">{error}</div></div>;
  if (!item || !page) return <div className="app-background screen"><Loading /> </div>;
  const locale = page.locale; const unavailable = item.kind === "physical" && item.stock !== null && item.stock <= 0;
  const booking = item.kind === "service" ? bookingBlockForItem(page, item.id) : undefined;
  const submitPurchase = async (shippingAddress?: ShippingAddress, quantity = 1) => { try { const result = await apiJson<{ url: string; demo: boolean }>("/api/checkout", { method: "POST", body: JSON.stringify({ pageId: page.id, scope: "item", itemId: item.id, blockId, mode: "one_time", quantity, ...(shippingAddress ? { country: shippingAddress.country, shippingAddress } : {}) }) }); if (result.demo || result.url.startsWith("/")) router.push(result.url); else window.location.assign(result.url); return true; } catch (err) { setError(toErrorMessage(err)); return false; } };
  const purchase = async () => { track("click", blockId); if (!user || user.role !== "buyer") { const returnTo = `/${slug}/items/${itemId}?blockId=${encodeURIComponent(blockId)}`; router.push(`/login?lang=${locale}&returnTo=${encodeURIComponent(returnTo)}`); return; } if (item.kind === "physical") { setShippingOpen(true); return; } await submitPurchase(); };
  return <AppearanceSurface lang={locale} appearance={page.appearance} accent={page.accent} className={`public-wrap app-background ${styles.publicRoot}`} onPointerDownCapture={rememberShippingTrigger} onFocusCapture={rememberShippingTrigger}><div className="public-top"><Link href={`/${slug}`} className="icon-button" aria-label={t(locale, "back")}><Icon name="ArrowLeft" /></Link><Link href="/" className="wordmark">PAGER<span>.</span></Link><span /></div><main className="public-page"><div className="eyebrow">{t(locale, item.kind)}</div><h1 style={{ margin: "20px 0 0", fontSize: "clamp(31px,7vw,53px)", letterSpacing: "-.07em" }}>{item.title}</h1><p className="muted" style={{ lineHeight: 1.6 }}>{item.description}</p><div className="item-price" style={{ fontSize: 24, marginTop: 25 }}>{formatMoney(item.price, item.currency, locale)}</div>{item.kind === "service" ? <Link className="button button-primary" style={{ width: "100%", marginTop: 24 }} href={booking ? `/${slug}#block-${encodeURIComponent(booking.id)}` : `/${slug}`} onClick={() => track("click", blockId)}>{booking ? t(locale, "chooseTime") : t(locale, "returnPage")}</Link> : <button className="button button-primary" style={{ width: "100%", marginTop: 24 }} disabled={unavailable} onClick={purchase}>{unavailable ? t(locale, "soldOut") : t(locale, "buy")}</button>}{page.demo && <div className="notice" style={{ marginTop: 15 }}>{t(locale, "demoHelp")}</div>}<div className="notice" style={{ marginTop: 15 }}><Icon name="Info" size={16} />{t(locale, "paymentSeparate")}</div></main>{shippingOpen && item.kind === "physical" && <ShippingModal item={item} locale={locale} onClose={() => setShippingOpen(false)} onSubmit={async (shippingAddress, quantity) => { const ok = await submitPurchase(shippingAddress, quantity); if (ok) setShippingOpen(false); }} restoreFocusRef={shippingFocusRef} />}</AppearanceSurface>;
}
