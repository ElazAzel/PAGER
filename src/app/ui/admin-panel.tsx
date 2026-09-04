"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, BarChart3, CircleAlert, Globe2, LayoutGrid, RefreshCw, ShieldCheck, SlidersHorizontal, UsersRound } from "lucide-react";
import type { AdminAuditList, AdminCreatorList, AdminOverview, AdminPeriod } from "@/lib/server/admin";
import type { Locale } from "@/lib/types";
import styles from "./admin-panel.module.css";

export function AdminPanel({ initial, initialCreators, initialAudit }: { initial: AdminOverview; initialCreators?: AdminCreatorList; initialAudit?: AdminAuditList }) {
  const [data, setData] = useState<AdminOverview | null>(initial);
  const [creators, setCreators] = useState<AdminCreatorList | null>(initialCreators ?? null);
  const [audit, setAudit] = useState<AdminAuditList | null>(initialAudit ?? null);
  const [creatorQuery, setCreatorQuery] = useState(initialCreators?.query ?? "");
  const [locale, setLocale] = useState<Locale>(initial.locale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const copy = (ru: string, en: string) => locale === "ru" ? ru : en;
  const number = (value: number) => new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(value));
  const money = (amount: number, currency: string) => {
    const format = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { style: "currency", currency });
    return format.format(amount / 10 ** format.resolvedOptions().maximumFractionDigits!);
  };
  async function refresh(days: AdminPeriod) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/overview?days=${days}`, { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401 || response.status === 403) {
        setData(null);
        throw new Error(copy("Доступ завершён. Войдите с аккаунтом администратора.", "Access has ended. Sign in with an administrator account."));
      }
      if (!response.ok) throw new Error(copy("Не удалось обновить показатели. Попробуйте ещё раз.", "Could not refresh the figures. Try again."));
      setData(await response.json() as AdminOverview);
      const [creatorResponse, auditResponse] = await Promise.all([fetch(`/api/admin/creators?limit=50&q=${encodeURIComponent(creatorQuery)}`, { cache: "no-store", credentials: "same-origin" }), fetch("/api/admin/audit?limit=20", { cache: "no-store", credentials: "same-origin" })]);
      if (creatorResponse.ok) setCreators(await creatorResponse.json() as AdminCreatorList);
      if (auditResponse.ok) setAudit(await auditResponse.json() as AdminAuditList);
    } catch (caught) { setError(caught instanceof Error ? caught.message : copy("Не удалось обновить данные.", "Could not refresh data.")); }
    finally { setLoading(false); }
  }
  async function searchCreators(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/creators?limit=50&q=${encodeURIComponent(creatorQuery.trim())}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(copy("Не удалось выполнить поиск авторов.", "Could not search creators."));
      setCreators(await response.json() as AdminCreatorList);
    } catch (caught) { setError(caught instanceof Error ? caught.message : copy("Не удалось выполнить поиск.", "Could not search.")); }
    finally { setLoading(false); }
  }

  const providerNames: Record<AdminOverview["integrations"][number]["id"], string> = { supabase: copy("Аккаунты и данные", "Accounts and data"), stripe: copy("Оплаты · Stripe", "Payments · Stripe"), cal: copy("Запись · Cal.com OAuth", "Booking · Cal.com OAuth"), email: copy("Письма · Resend", "Email · Resend"), jobs: copy("Задачи · Inngest", "Jobs · Inngest"), telegram: "Telegram" };
  const providerStatuses: Record<AdminOverview["integrations"][number]["mode"], string> = { demo: copy("Деморежим", "Demo mode"), disabled: copy("Выключено", "Disabled"), missing: copy("Не настроено", "Not configured"), configured: copy("Настроено", "Configured"), test: copy("Тестовый режим", "Test mode"), live: copy("Боевой режим задан", "Live mode configured") };

  return <main className={styles.shell} lang={locale}>
    <a className={styles.skipLink} href="#admin-overview">{copy("К обзору", "Skip to overview")}</a>
    <header className={styles.header}>
      <Link className={styles.back} href="/dashboard" aria-label={copy("В личный кабинет", "Back to workspace")}><ArrowLeft size={19} aria-hidden="true" /></Link>
      <Link href="/dashboard" className={styles.brand}>PAGER<span>{copy("Администратор", "Administrator")}</span></Link>
      <button className={styles.locale} type="button" onClick={() => setLocale(locale === "ru" ? "en" : "ru")} aria-label={copy("Switch to English", "Переключить на русский")}>{locale === "ru" ? "EN" : "RU"}</button>
    </header>
    <div className={styles.heading}>
      <div><div className={styles.eyebrow}><ShieldCheck size={15} aria-hidden="true" />{copy("Обзор платформы", "Platform overview")}</div><h1>{copy("Как работает PAGER", "How PAGER is doing")}</h1><p>{copy("Страницы, результаты и сервисы в одном месте.", "Pages, outcomes and services in one place.")}</p></div>
      {data && <button type="button" className={styles.refresh} onClick={() => void refresh(data.period.days)} disabled={loading}><RefreshCw size={16} aria-hidden="true" className={loading ? styles.spinning : undefined} />{copy("Обновить", "Refresh")}</button>}
    </div>
    {error && <div role="alert" className={styles.error}><CircleAlert size={18} aria-hidden="true" /><span>{error}</span>{!data && <Link href="/login">{copy("Войти", "Sign in")}</Link>}</div>}
    {data && <>
      {data.demo && <div className={styles.demo}><strong>{copy("Локальная демонстрация", "Local demonstration")}</strong><span>{copy("Аккаунты и страницы — примеры. Демооплаты, записи и просмотры исключены из рабочих показателей. Внешние сервисы здесь не выполняют операции.", "Accounts and pages are examples. Demo payments, bookings and visits are excluded from operating figures. External services do not perform operations here.")}</span></div>}
      <nav className={styles.navigation} aria-label={copy("Разделы админ-панели", "Admin panel sections")}>
        <a href="#admin-overview"><BarChart3 size={19} aria-hidden="true" />{copy("Обзор", "Overview")}</a><a href="#admin-pages"><LayoutGrid size={19} aria-hidden="true" />{copy("Страницы", "Pages")}</a><a href="#admin-services"><SlidersHorizontal size={19} aria-hidden="true" />{copy("Сервисы", "Services")}</a>
      </nav>
      <section id="admin-overview" className={styles.section} aria-labelledby="admin-overview-title" aria-busy={loading}>
        <div className={styles.sectionHeading}><h2 id="admin-overview-title">{copy("Пользователи и результаты", "People and outcomes")}</h2><div className={styles.period} role="group" aria-label={copy("Период отчёта", "Report period")}>{([7, 30] as const).map(days => <button key={days} type="button" aria-pressed={data.period.days === days} disabled={loading} onClick={() => void refresh(days)}>{days} {copy("дней", "days")}</button>)}</div></div>
        <p className={styles.caption}>{date(data.period.from)} — {date(data.period.to)} · UTC · {copy("сегодняшний день ещё не завершён", "today is still in progress")}</p>
        <div className={styles.census}>
          <div><UsersRound size={19} aria-hidden="true" /><strong>{number(data.totals.users)}</strong><span>{copy("аккаунтов всего", "total accounts")}</span></div>
          <div><strong>{number(data.totals.creators)}</strong><span>{copy("авторов", "creators")}</span></div>
          <div><Globe2 size={19} aria-hidden="true" /><strong>{number(data.totals.publishedPages)}</strong><span>{copy("опубликованных страниц", "published pages")}</span></div>
        </div>
        <div className={styles.metricGrid}>
          <Metric label={copy("Просмотры", "Page views")} value={number(data.activity.views)} detail={copy("Без просмотров автора и ботов", "Excludes owners and bots")} />
          <Metric label={copy("Посетители за день", "Daily visitors")} value={number(data.activity.visitors)} detail={copy("Сумма по страницам и дням", "Summed across pages and days")} />
          <Metric label={copy("Результативные обращения", "Converted opportunities")} value={number(data.activity.conversions)} detail={copy("Подтверждённая запись или оплата", "Confirmed booking or payment")} />
          <Metric label={copy("Результатов на страницу", "Outcomes per active page")} value={data.activity.activePages ? number(data.activity.northStar) : "—"} detail={`${number(data.activity.activePages)} ${copy("страниц с посетителями", "pages with visitors")}`} accent />
        </div>
        <div className={styles.twoColumns}>
          <article className={styles.card}><div className={styles.cardHeading}><h3>{copy("Подтверждённые поступления", "Confirmed receipts")}</h3><span className={styles.chip}>{number(data.payments.paidOrders)} {copy("заказов", "orders")}</span></div>
            {Object.keys(data.payments.amountsByCurrency).length ? <dl className={styles.moneyList}>{Object.entries(data.payments.amountsByCurrency).map(([currency, amount]) => <div key={currency}><dt>{currency}</dt><dd>{money(amount, currency)}</dd></div>)}</dl> : <p className={styles.empty}>{copy("Подтверждённых поступлений за период пока нет.", "No confirmed receipts in this period yet.")}</p>}
            <p className={styles.finePrint}>{copy("Платежи и продления по подтверждениям провайдера, за вычетом возвратов и открытых или проигранных споров. Валюты считаются отдельно.", "Provider-confirmed payments and renewals, less refunds and open or lost disputes. Currencies remain separate.")}</p>
          </article>
          <article className={styles.card}><div className={styles.cardHeading}><h3>{copy("Ошибки за период", "Errors in this period")}</h3><CircleAlert size={18} aria-hidden="true" /></div><dl className={styles.rows}><Row label={copy("Ошибки оплаты", "Payment failures")} value={number(data.operations.paymentFailures)} alert={data.operations.paymentFailures > 0} /><Row label={copy("Ошибки уведомлений", "Notification failures")} value={number(data.operations.notificationFailures)} alert={data.operations.notificationFailures > 0} /><Row label={copy("Неоплаченные из-за ошибки заказы", "Orders failed in this period")} value={number(data.operations.failedOrders)} /></dl><p className={styles.finePrint}>{copy("Ноль означает отсутствие записанных ошибок, а не проверку доступности сервисов.", "Zero means no recorded failures; it does not verify service availability.")}</p></article>
        </div>
      </section>
      <section id="admin-pages" className={styles.section} aria-labelledby="admin-pages-title"><div className={styles.sectionHeading}><h2 id="admin-pages-title">{copy("Опубликованные страницы", "Published pages")}</h2><span className={styles.chip}>{data.pages.length} / {data.pageList.total}</span></div><p className={styles.caption}>{copy("По просмотрам за выбранный период. Показано до 50 страниц.", "Ordered by views in this period. Up to 50 pages are shown.")}</p>
        <div className={styles.pageList}>{data.pages.length ? data.pages.map(page => <article key={page.id} className={styles.pageRow}><a className={styles.pageTitle} href={page.path} target="_blank" rel="noopener noreferrer"><span>{page.title}</span><small>{page.path}</small><ArrowUpRight size={18} aria-hidden="true" /></a><div className={styles.pageStats}><div><strong>{number(page.views)}</strong><span>{copy("просмотров", "views")}</span></div><div><strong>{number(page.conversions)}</strong><span>{copy("результатов", "outcomes")}</span></div></div></article>) : <p className={styles.empty}>{copy("Здесь появятся страницы после первой публикации.", "Pages will appear here after their first publication.")}</p>}</div>
      </section>
      {creators && <section id="admin-creators" className={styles.section} aria-labelledby="admin-creators-title"><div className={styles.sectionHeading}><h2 id="admin-creators-title">{copy("Авторы и модерация", "Creators and moderation")}</h2><span className={styles.chip}>{creators.pagination.total}</span></div><p className={styles.caption}>{copy("Поиск по имени, ID и опубликованному slug. Здесь нет CRM и закрытого содержания.", "Search by name, ID and published slug. CRM and private content are excluded.")}</p><form className={styles.searchForm} onSubmit={event => void searchCreators(event)}><label htmlFor="creator-search" className="sr-only">{copy("Поиск авторов", "Search creators")}</label><input id="creator-search" className={styles.searchInput} value={creatorQuery} onChange={event => setCreatorQuery(event.target.value)} placeholder={copy("Имя, ID или slug", "Name, ID or slug")} /><button type="submit" className={styles.refresh} disabled={loading}>{copy("Найти", "Search")}</button></form><div className={styles.pageList}>{creators.creators.length ? creators.creators.map(creator => { const publication = creator.publication; const status = publication?.moderation.status ?? "active"; const moderate = async (action: "block" | "restore") => { const reason = window.prompt(copy("Причина модерации", "Moderation reason"), action === "block" ? copy("Требует проверки", "Needs review") : copy("Проверено администратором", "Reviewed by administrator")); if (!reason || !publication) return; const response = await fetch(`/api/admin/pages/${encodeURIComponent(publication.id)}/moderation`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action, reason, expectedVersion: publication.moderation.version }) }); if (!response.ok) { setError(copy("Статус изменился. Обновите панель.", "Status changed. Refresh the panel.")); return; } await refresh(data.period.days); }; return <article key={creator.id} className={styles.pageRow}><div className={styles.pageTitle}><span>{creator.name}</span><small>{creator.id}{publication ? ` · /${publication.slug ?? ""}` : ""}</small></div><div className={styles.pageStats}><div><strong>{publication?.status ?? "draft"}</strong><span>{copy("публикация", "publication")}</span></div>{publication && <button type="button" className={styles.refresh} onClick={() => void moderate(status === "blocked" ? "restore" : "block")}>{status === "blocked" ? copy("Восстановить", "Restore") : copy("Заблокировать", "Block")}</button>}</div></article>; }) : <p className={styles.empty}>{copy("Авторов пока нет.", "No creators yet.")}</p>}</div></section>}
      {audit && <section id="admin-audit" className={styles.section} aria-labelledby="admin-audit-title"><div className={styles.sectionHeading}><h2 id="admin-audit-title">{copy("Журнал действий", "Audit log")}</h2><span className={styles.chip}>{audit.pagination.total}</span></div><div className={styles.pageList}>{audit.events.length ? audit.events.map(event => <article key={event.id} className={styles.pageRow}><div className={styles.pageTitle}><span>{event.action}</span><small>{event.publication?.path ?? event.pageId} · {event.actorId}</small></div><div className={styles.pageStats}><div><strong>{event.after}</strong><span>{new Date(event.createdAt).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</span></div></div></article>) : <p className={styles.empty}>{copy("Действий пока нет.", "No actions yet.")}</p>}</div></section>}
      <section id="admin-services" className={styles.section} aria-labelledby="admin-services-title"><div className={styles.sectionHeading}><h2 id="admin-services-title">{copy("Сервисы и очередь", "Services and queue")}</h2><span className={styles.chip}>{copy("Текущее состояние", "Current state")}</span></div>
        <div className={styles.twoColumns}><article className={styles.card}><h3>{copy("Настройка интеграций", "Integration setup")}</h3><dl className={styles.providerList}>{data.integrations.map(provider => <div key={provider.id}><dt>{providerNames[provider.id]}</dt><dd className={provider.mode === "configured" || provider.mode === "live" ? styles.configured : styles.neutral}>{providerStatuses[provider.mode]}</dd></div>)}</dl><p className={styles.finePrint}>{copy("Статус показывает наличие настроек на сервере. Доставка, OAuth и реальные платежи требуют отдельной проверки у провайдеров.", "Status reflects server configuration. Delivery, OAuth and real payments require separate provider verification.")}</p></article>
          <article className={styles.card}><h3>{copy("Требует внимания", "Needs attention")}</h3><dl className={styles.rows}><Row label={copy("Уведомления с ошибкой", "Failed notifications")} value={number(data.operations.failedNotifications)} alert={data.operations.failedNotifications > 0} /><Row label={copy("Ожидают отправки", "Pending notifications")} value={number(data.operations.pendingNotifications)} /><Row label={copy("Время отправки наступило", "Notifications due")} value={number(data.operations.overdueNotifications)} alert={data.operations.overdueNotifications > 0} /><Row label={copy("Оспариваемые заказы", "Disputed orders")} value={number(data.operations.disputedOrders)} alert={data.operations.disputedOrders > 0} /></dl><p className={styles.finePrint}>{copy("Очередь за всё время, без тестовых и отменённых уведомлений. Разбирать сбои нужно в кабинете соответствующего сервиса.", "Current queue across all dates, excluding test and superseded notices. Investigate failures in the relevant provider dashboard.")}</p></article>
        </div>
        <div className={styles.connectionNote}><strong>{copy("Подключения авторов", "Creator connections")}</strong><span>Stripe: {number(data.connections.stripe)} · {copy("приём оплат включён", "charges enabled")}: {number(data.connections.stripeReady)} · Cal.com: {number(data.connections.cal)}</span></div>
      </section>
      <footer className={styles.footer}><ShieldCheck size={16} aria-hidden="true" /><p>{copy("Обновлено", "Updated")} {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(data.generatedAt))} UTC. {copy("Доступ только у назначенных администраторов.", "Available to assigned administrators only.")}</p></footer>
      <div className="sr-only" role="status" aria-live="polite">{loading ? copy("Обновляем показатели", "Refreshing figures") : ""}</div>
    </>}
  </main>;
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <article className={`${styles.metric} ${accent ? styles.metricAccent : ""}`}><h3>{label}</h3><strong>{value}</strong><p>{detail}</p></article>;
}

function Row({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <div><dt>{label}</dt><dd className={alert ? styles.alertValue : undefined}>{value}</dd></div>;
}
