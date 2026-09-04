"use client";

import { useEffect, useId, useState } from "react";
import type { AnalyticsDays, AnalyticsReport, Locale } from "@/lib/types";
import { formatMoney } from "@/lib/blocks";
import { apiJson } from "./api";
import styles from "./analytics-panel.module.css";

const copy = {
  ru: {
    title: "Аналитика страницы", intro: "От первого визита до записи и оплаты.", days: "дней", range: "Период аналитики", refresh: "Обновить", loading: "Загружаем аналитику…", error: "Не удалось загрузить аналитику. Попробуйте ещё раз.", retry: "Повторить",
    demo: "Локальное демо. Тестовые визиты, записи и оплаты исключены из показателей. Это не данные реального бизнеса.",
    visits: "Визиты", visitors: "Посетители по дням", clicks: "Клики", conversions: "Конверсии", receipts: "Поступления", confirmed: "Подтверждённые записи или оплаты", net: "После возвратов, по каждой валюте", traffic: "Посещаемость", chart: "Показатель графика", daily: "Данные по дням", date: "Дата", empty: "Пока нет визитов", emptyHelp: "Поделитесь опубликованной страницей. Визиты других людей появятся здесь; ваши просмотры не учитываются.", unpublished: "Опубликуйте страницу, чтобы начать собирать аналитику.",
    sources: "Откуда приходят", devices: "Устройства", results: "Действия клиентов", leads: "Заявки из формы", bookings: "Подтверждённые записи", paidOrders: "Оплаченные заказы", repeat: "Повторные клиенты", formOpens: "Открытия формы", formSubmits: "Отправленные формы", bookingStarts: "Начатые записи", bookingConfirmed: "Подтверждения записи", clicksTitle: "Что привлекает внимание", block: "Блок", noClicks: "Пока нет кликов по блокам", engagement: "посетителей нажали на блок", unknown: "Не определено", direct: "Прямые переходы", search: "Поиск", social: "Соцсети", ai: "ИИ-сервисы", referral: "Другие сайты", mobile: "Телефон", tablet: "Планшет", desktop: "Компьютер",
    timing: "UTC · сегодняшний день ещё не завершён", privacy: "Посетители уникальны в пределах страницы и дня. Один человек в разные дни учитывается повторно. Личные данные посетителей не показываются.", attribution: "Источники определяются по переходу и могут быть неизвестны. Переходы из ИИ-сервисов не означают показы в ответах ИИ.", resultsHelp: "Запись и её оплата дают одну конверсию. Продление подписки не создаёт новую конверсию. Действия и визиты не связаны персональными идентификаторами.", moneyHelp: "Подтверждённые Stripe платежи, включая продления и доставку; за вычетом известных возвратов и спорных сумм, до комиссий Stripe. Это не сумма выплат на банк.", details: "Как считаются показатели",
  },
  en: {
    title: "Page analytics", intro: "From the first visit to a booking and payment.", days: "days", range: "Analytics period", refresh: "Refresh", loading: "Loading analytics…", error: "Analytics could not be loaded. Please try again.", retry: "Try again",
    demo: "Local demo. Test visits, bookings and payments are excluded from these metrics. These are not real business results.",
    visits: "Visits", visitors: "Daily visitors", clicks: "Clicks", conversions: "Conversions", receipts: "Receipts", confirmed: "Confirmed bookings or payments", net: "After refunds, by currency", traffic: "Page traffic", chart: "Chart metric", daily: "Daily data", date: "Date", empty: "No visits yet", emptyHelp: "Share your published page. Other people's visits will appear here; your own views are excluded.", unpublished: "Publish your page to start collecting analytics.",
    sources: "Where visitors come from", devices: "Devices", results: "Customer actions", leads: "Form enquiries", bookings: "Confirmed bookings", paidOrders: "Paid orders", repeat: "Repeat customers", formOpens: "Form opens", formSubmits: "Submitted forms", bookingStarts: "Booking starts", bookingConfirmed: "Confirmed bookings", clicksTitle: "What gets attention", block: "Block", noClicks: "No block clicks yet", engagement: "of visitors clicked a block", unknown: "Unknown", direct: "Direct", search: "Search", social: "Social", ai: "AI services", referral: "Other websites", mobile: "Phone", tablet: "Tablet", desktop: "Desktop",
    timing: "UTC · today is still in progress", privacy: "Visitors are unique within one page and day. The same person on different days is counted again. Visitor personal data is not shown.", attribution: "Sources depend on referral information and may be unknown. Visits from AI services are not impressions in AI answers.", resultsHelp: "A booking and its payment count as one conversion. Subscription renewals do not add a conversion. Visits and outcomes are not linked with personal identifiers.", moneyHelp: "Confirmed Stripe payments, including renewals and shipping, less recorded refunds and disputed amounts, before Stripe fees. This is not a bank payout balance.", details: "How these metrics work",
  },
};

export function AnalyticsPanel({ locale, demo }: { locale: Locale; demo: boolean }) {
  const c = copy[locale];
  const [days, setDays] = useState<AnalyticsDays>(30);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ report: AnalyticsReport | null; error: boolean; key: string }>({ report: null, error: false, key: "" });
  const [metric, setMetric] = useState<"views" | "clicks">("views");
  const requestKey = `${days}:${reload}`;
  const loading = result.key !== requestKey;
  const report = loading ? null : result.report;
  const chartId = useId();
  useEffect(() => {
    const controller = new AbortController();
    apiJson<{ report: AnalyticsReport }>(`/api/analytics/report?days=${days}`, { signal: controller.signal }).then(({ report }) => {
      if (!controller.signal.aborted) setResult({ report, error: false, key: requestKey });
    }).catch(() => { if (!controller.signal.aborted) setResult({ report: null, error: true, key: requestKey }); });
    return () => controller.abort();
  }, [days, requestKey]);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(value));
  const percentage = (value: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
  const max = report ? Math.max(1, ...report.daily.map(day => day[metric])) : 1;
  const chartWidth = 640; const chartHeight = 160;
  return <section className={styles.panel} aria-label={c.title}>
    <header className={styles.heading}><div><h1>{c.title}</h1><p>{c.intro}</p></div><button type="button" className={styles.refresh} onClick={() => setReload(value => value + 1)} disabled={loading}>{c.refresh}</button></header>
    <div className={styles.toolbar}><div className={styles.period} role="group" aria-label={c.range}>{([7, 30, 90] as const).map(value => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value} {c.days}</button>)}</div><span className={styles.hint}>{c.timing}</span></div>
    {(demo || report?.demo) && <p className={styles.demo}>{c.demo}</p>}
    {loading && <div className={styles.loading} role="status">{c.loading}</div>}
    {!loading && result.error && <div className={styles.empty} role="alert"><p>{c.error}</p><button className={styles.refresh} type="button" onClick={() => setReload(value => value + 1)}>{c.retry}</button></div>}
    {report && <>
      <div className={styles.stats}>
        <article className={styles.stat}><span>{c.visitors}</span><strong>{number(report.summary.visitors)}</strong><small>{number(report.summary.views)} {c.visits.toLocaleLowerCase(locale)}</small></article>
        <article className={styles.stat}><span>{c.clicks}</span><strong>{number(report.summary.clicks)}</strong><small>{report.summary.clickRate === null ? "—" : percentage(report.summary.clickRate)} {c.engagement}</small></article>
        <article className={styles.stat}><span>{c.conversions}</span><strong>{number(report.summary.conversions)}</strong><small>{c.confirmed}</small></article>
        <article className={`${styles.stat} ${styles.money}`}><span>{c.receipts}</span><strong>{Object.entries(report.summary.revenueByCurrency).length ? Object.entries(report.summary.revenueByCurrency).map(([currency, amount]) => <span key={currency}>{formatMoney(amount, currency, locale)}</span>) : "—"}</strong><small>{c.net}</small></article>
      </div>
      {report.summary.views === 0 && <div className={styles.empty}><strong>{c.empty}</strong><p>{report.hasPublishedPage ? c.emptyHelp : c.unpublished}</p></div>}
      <article className={styles.card}>
        <div className={styles.cardHeading}><div><h2>{c.traffic}</h2><p>{date(report.startAt)} — {date(report.endAt)}</p></div><div className={styles.metric} role="group" aria-label={c.chart}><button type="button" aria-pressed={metric === "views"} onClick={() => setMetric("views")}>{c.visits}</button><button type="button" aria-pressed={metric === "clicks"} onClick={() => setMetric("clicks")}>{c.clicks}</button></div></div>
        <div className={styles.chart}><span className={styles.chartMax}>{number(max)}</span><svg viewBox={`0 0 ${chartWidth} ${chartHeight + 12}`} role="img" aria-labelledby={chartId} preserveAspectRatio="none"><title id={chartId}>{c.traffic}: {metric === "views" ? c.visits : c.clicks}. {c.daily}.</title>{[0, .5, 1].map(value => <line key={value} x1="0" x2={chartWidth} y1={chartHeight * value} y2={chartHeight * value} className={styles.gridline} />)}{report.daily.map((day, i) => { const height = day[metric] / max * (chartHeight - 8); const width = chartWidth / report.daily.length; return <rect key={day.date} x={i * width + width * .15} y={chartHeight - height} width={width * .7} height={height} rx={Math.min(4, width * .15)} className={styles.bar}><title>{date(day.date)}: {number(day[metric])}</title></rect>; })}</svg><div className={styles.chartDates}><span>{date(report.startAt)}</span><span>{date(report.endAt)}</span></div></div>
        <details className={styles.dataDetails}><summary>{c.daily}</summary><div className={styles.tableWrap}><table><thead><tr><th scope="col">{c.date}</th><th scope="col">{c.visits}</th><th scope="col">{c.visitors}</th><th scope="col">{c.clicks}</th><th scope="col">{c.conversions}</th></tr></thead><tbody>{report.daily.map(day => <tr key={day.date}><th scope="row">{date(day.date)}</th><td>{number(day.views)}</td><td>{number(day.visitors)}</td><td>{number(day.clicks)}</td><td>{number(day.conversions)}</td></tr>)}</tbody></table></div></details>
      </article>
      <div className={styles.columns}>
        <article className={styles.card}><h2>{c.sources}</h2><ul className={styles.breakdown}>{report.sources.map(source => <li key={source.key}><div><span>{c[source.key]}</span><strong>{number(source.views)}<small>{percentage(source.share)}</small></strong></div><div className={styles.track} aria-hidden="true"><span style={{ width: `${source.share * 100}%` }} /></div></li>)}</ul><p className={styles.note}>{c.attribution}</p></article>
        <article className={styles.card}><h2>{c.devices}</h2><ul className={styles.breakdown}>{report.devices.map(device => <li key={device.key}><div><span>{c[device.key]}</span><strong>{number(device.views)}<small>{percentage(device.share)}</small></strong></div><div className={styles.track} aria-hidden="true"><span style={{ width: `${device.share * 100}%` }} /></div></li>)}</ul></article>
      </div>
      <div className={styles.columns}>
        <article className={styles.card}><h2>{c.results}</h2><dl className={styles.outcomes}>{([['formOpens', report.summary.formOpens], ['formSubmits', report.summary.formSubmits], ['bookingStarts', report.summary.bookingStarts], ['bookingConfirmed', report.summary.bookingConfirmed], ['leads', report.summary.leads], ['bookings', report.summary.bookings], ['paidOrders', report.summary.paidOrders], ['repeat', report.summary.repeatContacts]] as const).map(([label, value]) => <div key={label}><dt>{c[label]}</dt><dd>{number(value)}</dd></div>)}</dl><p className={styles.note}>{c.resultsHelp}</p></article>
        <article className={styles.card}><h2>{c.clicksTitle}</h2>{report.blocks.some(block => block.clicks > 0) ? <ol className={styles.blocks}>{report.blocks.filter(block => block.clicks > 0).map(block => <li key={block.id}><span>{block.title}</span><strong>{number(block.clicks)}<small>{c.clicks.toLocaleLowerCase(locale)}</small></strong></li>)}</ol> : <p className={styles.noData}>{c.noClicks}</p>}</article>
      </div>
      <details className={styles.method}><summary>{c.details}</summary><p>{c.privacy}</p><p>{c.resultsHelp}</p><p>{c.moneyHelp}</p><p>{c.timing}</p></details>
    </>}
  </section>;
}
