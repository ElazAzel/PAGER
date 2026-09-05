"use client";

import { useState } from "react";
import type { Booking, CatalogItem, Locale, Order, Subscription } from "@/lib/types";
import { formatMoney } from "@/lib/blocks";
import { t } from "@/lib/i18n";
import { apiJson, toErrorMessage } from "./api";
import { Icon } from "./pager-icon";
import styles from "./buyer-library.module.css";

function dateLabel(value: string, locale: Locale, timezone?: string, withTime = false) {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", ...(withTime ? { timeStyle: "short" } : {}), timeZone: timezone }).format(new Date(value));
}

export function LibraryOrders({ locale, orders, items }: { locale: Locale; orders: Order[]; items: CatalogItem[] }) {
  const ru = locale === "ru";
  return <section className="data-card"><div className="data-card-head"><h2>{t(locale, "orders")}</h2><span className="status-chip">{orders.length}</span></div>{orders.length ? <div className={styles.list}>{orders.map(order => {
    // items only contains server-authorized purchase grants, including hidden products.
    const item = items.find(candidate => candidate.id === order.itemId);
    const download = order.status === "paid" && item?.kind === "digital" && item.fileId;
    return <article key={order.id} className={styles.row}>
      <div className={styles.summary}><div><h3>{order.title}</h3><p>{formatMoney(order.amount + order.shippingAmount, order.currency, locale)} · {ru ? "Количество" : "Quantity"}: {order.quantity}</p></div><span className={"status-chip " + (order.status === "paid" ? "green" : "")}>{t(locale, order.status)}</span></div>
      {download && <a className="button button-secondary" href={`/api/assets/${encodeURIComponent(download)}`}><Icon name="Download" size={16} />{ru ? "Скачать" : "Download"}</a>}
      {order.status === "paid" && (item?.kind === "physical" || order.shippingAddress || order.tracking) && <div className={styles.details}><span>{t(locale, "shipping")}: {t(locale, order.fulfillment)}</span>{order.tracking && <span>{t(locale, "tracking")}: <strong>{order.tracking}</strong></span>}</div>}
      {order.status === "pending" && <p className="muted small">{ru ? "Доступ появится после подтверждения оплаты. Если вы уже оплатили, обновите библиотеку через минуту." : "Access appears after payment is confirmed. If you have paid, refresh the library in a minute."}</p>}
    </article>;
  })}</div> : <div className="empty-state">{t(locale, "noPurchases")}</div>}</section>;
}

export function LibrarySubscriptions({ locale, subscriptions, orders, onUpdated }: { locale: Locale; subscriptions: Subscription[]; orders: Order[]; onUpdated: (subscription: Subscription) => void }) {
  const [confirmId, setConfirmId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ru = locale === "ru";
  if (!subscriptions.length) return null;
  const cancel = async (id: string) => {
    setBusy(true); setError("");
    try {
      const result = await apiJson<{ subscription: Subscription }>(`/api/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      onUpdated(result.subscription); setConfirmId("");
    } catch (err) { setError(toErrorMessage(err)); } finally { setBusy(false); }
  };
  return <section className="data-card" aria-label={ru ? "Подписки" : "Subscriptions"}><div className="data-card-head"><h2>{ru ? "Подписки" : "Subscriptions"}</h2></div><div className={styles.list}>{subscriptions.map(subscription => <article key={subscription.id} className={styles.row}>
    <div className={styles.summary}><div><h3>{orders.find(order => order.id === subscription.orderId)?.title || (subscription.scope === "page" ? t(locale, "wholePage") : t(locale, "paidAccess"))}</h3><p>{t(locale, "subscriptionUntil")} {dateLabel(subscription.paidThrough, locale)}</p></div><span className={"status-chip " + (subscription.status === "active" ? "green" : "")}>{subscription.cancelAtPeriodEnd ? (ru ? "Продление отключено" : "Renewal cancelled") : subscription.status === "cancelled" ? (ru ? "Завершена" : "Ended") : subscription.status === "past_due" ? (ru ? "Платёж просрочен" : "Payment overdue") : (ru ? "Активна" : "Active")}</span></div>
    {subscription.status !== "cancelled" && !subscription.cancelAtPeriodEnd && (confirmId === subscription.id ? <div className={styles.confirmation}><p>{ru ? "Отключить автоматическое продление? Доступ сохранится до конца оплаченного периода." : "Cancel automatic renewal? Your access remains until the end of the paid period."}</p><div className={styles.actions}><button type="button" className="button button-secondary" disabled={busy} onClick={() => { setConfirmId(""); setError(""); }}>{ru ? "Оставить подписку" : "Keep subscription"}</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void cancel(subscription.id)}>{t(locale, "cancelSubscription")}</button></div>{error && <p className="notice error-notice" role="alert">{error}</p>}</div> : <button type="button" className="button button-secondary" disabled={busy} onClick={() => { setConfirmId(subscription.id); setError(""); }}>{t(locale, "cancelSubscription")}</button>)}
  </article>)}</div></section>;
}

export function LibraryBookings({ locale, bookings, onUpdated }: { locale: Locale; bookings: Booking[]; onUpdated: (booking: Booking) => void }) {
  const [confirmId, setConfirmId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const [now] = useState(() => Date.now());
  const ru = locale === "ru";
  const cancel = async (id: string) => {
    setBusy(true); setError("");
    try {
      const result = await apiJson<{ booking: Booking; providerUpdatePending: boolean }>(`/api/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      onUpdated(result.booking);
      if (result.providerUpdatePending) setPending(previous => [...previous, id]);
      setConfirmId("");
    } catch (err) { setError(toErrorMessage(err)); } finally { setBusy(false); }
  };
  return <section className="data-card"><div className="data-card-head"><h2>{t(locale, "bookings")}</h2></div>{bookings.length ? <div className={styles.list}>{bookings.map(booking => <article key={booking.id} className={styles.row}>
    <div className={styles.summary}><div><h3>{booking.title}</h3><p>{dateLabel(booking.startAt, locale, booking.timezone, true)}{booking.timezone ? ` · ${booking.timezone}` : ""}</p></div><span className={"status-chip " + (booking.status === "confirmed" ? "green" : "")}>{booking.status === "confirmed" ? t(locale, "booked") : (ru ? "Отменена" : "Cancelled")}</span></div>
    {booking.status === "confirmed" && pending.includes(booking.id) ? <p className="notice" role="status">{ru ? "Запрос на отмену отправлен. Календарь ещё подтверждает изменение. Обновите библиотеку через минуту." : "Cancellation requested. The calendar is still confirming the change. Refresh the library in a minute."}</p> : booking.status === "confirmed" && Date.parse(booking.startAt) > now && (confirmId === booking.id ? <div className={styles.confirmation}><p>{ru ? "Отменить эту встречу? Возврат оплаты, если она была, нужно согласовать с автором отдельно." : "Cancel this session? If you paid, arrange any refund with the creator separately."}</p><div className={styles.actions}><button type="button" className="button button-secondary" disabled={busy} onClick={() => { setConfirmId(""); setError(""); }}>{ru ? "Оставить встречу" : "Keep booking"}</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void cancel(booking.id)}>{t(locale, "cancelBooking")}</button></div>{error && <p className="notice error-notice" role="alert">{error}</p>}</div> : <button type="button" className="button button-secondary" disabled={busy} onClick={() => { setConfirmId(booking.id); setError(""); }}>{t(locale, "cancelBooking")}</button>)}
  </article>)}</div> : <div className="empty-state">{ru ? "Ваши встречи появятся здесь после записи." : "Your sessions appear here after booking."}</div>}</section>;
}
