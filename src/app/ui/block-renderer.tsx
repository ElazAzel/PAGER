"use client";

/* PAGER renders creator supplied URLs and data URLs; next/image cannot optimize arbitrary uploads without a remote pattern. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Block, BlockData, BlockType, CatalogItem, PublicBlock } from "@/lib/types";
import type { AccessOfferMode } from "@/lib/commerce";
import { BLOCK_META } from "@/lib/blocks";
import { formatMoney, safeHref } from "@/lib/blocks";
import { Icon } from "./pager-icon";
import { AccessOfferButtons } from "./access-offers";
import { blockEffectAttributes, type PageAppearance } from "@/lib/appearance";

type RenderBlock = Block | PublicBlock;
type Props = {
  block: RenderBlock;
  items?: CatalogItem[];
  locale?: "ru" | "en";
  slug?: string;
  editor?: boolean;
  library?: boolean;
  appearance?: Partial<PageAppearance>;
  sequence?: number;
  onSelect?: (block: Block) => void;
  onDuplicate?: (block: Block) => void;
  onToggleHidden?: (block: Block) => void;
  onDelete?: (block: Block) => void;
  onBuyBlock?: (block: RenderBlock, mode?: AccessOfferMode) => void;
  onItemBuy?: (item: CatalogItem, block: RenderBlock) => void;
  onItemDetails?: (item: CatalogItem, block: RenderBlock) => void;
  onBook?: (item: CatalogItem | undefined, block: RenderBlock) => void;
  onLead?: (block: RenderBlock) => void;
  onAction?: (block: RenderBlock) => void;
  bookingOrigin?: (item: CatalogItem) => PublicBlock | undefined;
};

const labelFor = (type: BlockType, locale: "ru" | "en") => BLOCK_META[type][locale];
const dataOf = (block: RenderBlock): BlockData => block.data ?? {};
const plain = (value = "") => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const safeHtml = (value = "") => value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "").replace(/javascript\s*:/gi, "");
const initials = (name = "PAGER") => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "P";

function ItemCard({ item, block, locale, slug, onBuy, onDetails, onBook, bookingBlock }: { item: CatalogItem; block: RenderBlock; locale: "ru" | "en"; slug?: string; onBuy?: Props["onItemBuy"]; onDetails?: Props["onItemDetails"]; onBook?: Props["onBook"]; bookingBlock?: PublicBlock }) {
  const service = item.kind === "service";
  const unavailable = item.kind === "physical" && item.stock !== null && item.stock <= 0;
  return <article className="item-card">
    <div className="item-card-copy">
      <h4>{item.title}</h4>
      <p>{item.description}</p>
      <div className="item-price">{formatMoney(item.price, item.currency, locale)}</div>
    </div>
    <div className="item-actions">
      {slug && <Link className="button button-secondary" href={`/${slug}/items/${item.id}?blockId=${encodeURIComponent(block.id)}`} onClick={event => { if (onDetails) { event.preventDefault(); onDetails(item, block); } }}>{locale === "ru" ? "Подробнее" : "Details"}</Link>}
      {service ? (bookingBlock && onBook && <button className="button button-primary" onClick={() => onBook(item, bookingBlock)}>{locale === "ru" ? "Записаться" : "Book"}</button>) : <button className="button button-primary" disabled={unavailable} onClick={() => onBuy?.(item, block)}>{unavailable ? (locale === "ru" ? "Нет" : "Sold out") : (locale === "ru" ? "Купить" : "Buy")}</button>}
    </div>
  </article>;
}

function Countdown({ endsAt, locale }: { endsAt?: string; locale: "ru" | "en" }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  if (now === null) return endsAt && Number.isFinite(Date.parse(endsAt)) ? <time dateTime={endsAt}>{new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(endsAt))}</time> : null;
  const remaining = Math.max(0, (Date.parse(endsAt ?? "") || now) - now);
  const values = [Math.floor(remaining / 86400000), Math.floor(remaining / 3600000) % 24, Math.floor(remaining / 60000) % 60, Math.floor(remaining / 1000) % 60];
  const names = locale === "ru" ? ["дней", "часов", "минут", "секунд"] : ["days", "hours", "mins", "secs"];
  return <div className="countdown">{values.map((value, index) => <div className="countdown-cell" key={names[index]}><strong>{String(value).padStart(2, "0")}</strong><span>{names[index]}</span></div>)}</div>;
}

function Faq({ data }: { data: BlockData }) {
  return <div className="faq-list">{(data.items ?? []).map((item, index) => <details className="faq-item" key={`${item.title}-${index}`}><summary className="faq-question"><span>{item.title}</span><Icon name="ChevronDown" size={15} /></summary><div className="faq-answer rich-text" dangerouslySetInnerHTML={{ __html: safeHtml(item.text || "") }} /></details>)}</div>;
}

function Scratch({ data, locale }: { data: BlockData; locale: "ru" | "en" }) {
  const [revealed, setRevealed] = useState(false);
  return <><h3>{data.title || (locale === "ru" ? "Подарок" : "A gift")}</h3><button className={`scratch ${revealed ? "revealed" : ""}`} onClick={() => setRevealed(true)}>{revealed ? data.code || data.text : (locale === "ru" ? "Нажмите, чтобы открыть подарок" : "Tap to reveal")}</button></>;
}

function Gallery({ data, beforeAfter = false }: { data: BlockData; beforeAfter?: boolean }) {
  const [position, setPosition] = useState(50);
  const [index, setIndex] = useState(0);
  const items = data.items ?? [];
  const images = items.map(item => item.image).filter(Boolean) as string[];
  if (beforeAfter) return <div className="visual-block before-after"><div className="before-after-media"><img src={data.beforeImage || data.afterImage || ""} alt={data.beforeAlt || data.alt || data.title || "Before image"} /><div className="after-layer" style={{ width: `${position}%` }}><img src={data.afterImage || data.beforeImage || ""} alt={data.afterAlt || data.alt || data.title || "After image"} /></div></div><label className="sr-only" htmlFor={`before-after-${position}`}>Compare images</label><input id={`before-after-${position}`} type="range" min="0" max="100" value={position} onChange={event => setPosition(Number(event.target.value))} /></div>;
  if (!images.length) return <div className="media-placeholder"><Icon name="Image" size={25} /></div>;
  const current = items.filter(item => item.image)[index];
  return <div className="visual-block"><img src={images[index]} alt={current?.alt || current?.title || data.alt || data.title || "Gallery image"} /><div className="gallery-controls"><button type="button" className="icon-button" onClick={() => setIndex((index - 1 + images.length) % images.length)} aria-label="Previous image"><Icon name="ChevronLeft" /></button><span>{index + 1} / {images.length}</span><button type="button" className="icon-button" onClick={() => setIndex((index + 1) % images.length)} aria-label="Next image"><Icon name="ChevronRight" /></button></div></div>;
}

export function BlockRenderer({ block, items = [], locale = "ru", slug, editor = false, library = false, appearance, sequence = 0, onSelect, onDuplicate, onToggleHidden, onDelete, onBuyBlock, onItemBuy, onItemDetails, onBook, onLead, onAction, bookingOrigin }: Props) {
  const data = dataOf(block);
  const meta = BLOCK_META[block.type];
  const locked = "locked" in block && block.locked && !editor;
  const effects = blockEffectAttributes(appearance, block.appearance);
  const effectStyle = { "--appearance-delay": `${Math.min(8, Math.max(0, Number.isFinite(sequence) ? sequence : 0)) * 40}ms` } as React.CSSProperties;
  const recordAction = (event: React.MouseEvent<HTMLElement>) => {
    // Locked purchases are reported by the unlock button handler with block_access.
    if (editor || locked || !onAction || !(event.target instanceof Element)) return;
    const control = event.target.closest("a[href],button");
    if (!control || control.closest(".gallery-controls,.scratch,.faq-list") || (control instanceof HTMLButtonElement && control.disabled)) return;
    onAction(block);
  };
  if (!editor && (block.archived && !library)) return null;
  if (!editor && block.hidden && !library) return null;
  if (locked) return <article id={"block-" + block.id} {...effects} style={effectStyle} onClickCapture={recordAction} className={"public-block appearance-block locked-block " + block.type + " " + block.width}><div className="lock-content"><div className="lock-icon"><Icon name="LockKeyhole" size={18} /></div><h3>{data.title || meta[locale]}</h3><p>{block.teaser || (locale === "ru" ? "Материал открывается после покупки." : "Available after purchase.")}</p><div className="block-cta"><AccessOfferButtons pricing={block.pricing} locale={locale} onSelect={mode => onBuyBlock?.(block, mode)} /></div></div></article>;

  const content = (() => {
    switch (block.type) {
      case "profile": return <div className="public-profile-block"><div className="avatar avatar-lg">{data.avatar ? <img src={data.avatar} alt={data.name || data.title || ""} width={70} height={70} /> : initials(data.name)}</div><div><h2>{data.name || data.title}</h2><div className="public-role">{data.profession || data.subtitle}</div>{data.location && <div className="muted small"><Icon name="MapPin" size={13} /> {data.location}</div>}<div className="rich-text" dangerouslySetInnerHTML={{ __html: safeHtml(data.text || "") }} /></div></div>;
      case "text": return <div className="public-block-content"><h2>{data.title || meta[locale]}</h2><div className="rich-text" dangerouslySetInnerHTML={{ __html: safeHtml(data.text || "") }} /></div>;
      case "image": return <div className="visual-block">{data.image ? <img src={data.image} alt={data.alt || data.title || ""} /> : <div className="media-placeholder"><Icon name="Image" size={25} /></div>}{data.title && <div className="public-block-content"><h3>{data.title}</h3></div>}</div>;
      case "separator": return <div className="separator" aria-hidden="true" />;
      case "link": { const href = safeHref(data.url); return href ? <a className="public-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}><div className="public-link-icon"><Icon name="Link" size={17} /></div><div className="public-link-copy"><strong>{data.title || meta[locale]}</strong><span>{data.text || href}</span></div><Icon name="ArrowUpRight" size={16} /></a> : <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><p>{data.text}</p></div>; }
      case "socials": return <div className="social-row">{(data.items ?? []).map((item, index) => { const href = safeHref(item.url); return href ? <a className="social-pill" key={`${item.title}-${index}`} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer"><Icon name="AtSign" size={14} />{item.title}</a> : null; })}</div>;
      case "video": { const href = safeHref(data.url); const title = data.title || meta[locale]; return <>{href ? <a className="video-placeholder video-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} aria-label={title}><Icon name="Play" size={30} /><span>{title}<small>{locale === "ru" ? "Открыть видео" : "Open video"}</small></span></a> : <div className="video-placeholder video-unavailable" role="status"><Icon name="Info" size={24} /><span>{title}<small>{locale === "ru" ? "Видео ещё не добавлено" : "Video is not configured yet"}</small></span></div>}<div className="public-block-content"><h3>{title}</h3>{data.text && <p>{data.text}</p>}</div></>; }
      case "carousel": return <><Gallery data={data} /><div className="public-block-content"><h3>{data.title || meta[locale]}</h3></div></>;
      case "before_after": return <><div className="public-block-content"><h3>{data.title || meta[locale]}</h3></div><Gallery data={data} beforeAfter /></>;
      case "testimonial": return <div className="public-block-content"><div className="quote-mark">“</div><div className="rich-text" dangerouslySetInnerHTML={{ __html: safeHtml(data.text || "") }} /><div className="quote-name">{data.name}</div><div className="quote-role">{data.subtitle}</div></div>;
      case "faq": return <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><Faq data={data} /></div>;
      case "map": { const href = safeHref(data.url); const title = data.title || meta[locale]; const address = data.address || (locale === "ru" ? "Добавьте адрес" : "Add an address"); return href ? <a className="public-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}><div className="public-link-icon"><Icon name="MapPin" size={17} /></div><div className="public-link-copy"><strong>{title}</strong><span>{address}</span></div><Icon name="ArrowRight" size={16} /></a> : <div className="public-link" role="status"><div className="public-link-icon"><Icon name="MapPin" size={17} /></div><div className="public-link-copy"><strong>{title}</strong><span>{address}</span></div><span className="status-chip">{locale === "ru" ? "Нужна настройка" : "Setup required"}</span></div>; }
      case "messenger": { const href = safeHref(data.url); return <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><p>{data.text}</p>{href && <a className="button button-primary" href={href} target="_blank" rel="noreferrer"><Icon name="MessageCircle" size={15} />{data.label || (locale === "ru" ? "Написать" : "Message")}</a>}</div>; }
      case "download": return <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><p>{data.text}</p>{data.fileId ? <a className="button button-quiet" href={`/api/assets/${data.fileId}`}><Icon name="Download" size={15} />{data.label || (locale === "ru" ? "Скачать" : "Download")}</a> : <span className="status-chip">{locale === "ru" ? "Файл ещё не загружен" : "File not uploaded"}</span>}</div>;
      case "pricing": case "catalog": case "product": { const shown = items.filter(item => data.itemIds?.includes(item.id)); return <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><div className="item-list">{shown.map(item => <ItemCard key={item.id} item={item} block={block} locale={locale} slug={slug} onBuy={onItemBuy} onDetails={onItemDetails} onBook={onBook} bookingBlock={bookingOrigin?.(item)} />)}</div>{!shown.length && <p>{locale === "ru" ? "Предложения появятся здесь." : "Your offers will appear here."}</p>}</div>; }
      case "countdown": return <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><Countdown endsAt={data.endsAt} locale={locale} /><p>{data.text}</p></div>;
      case "scratch": return <div className="public-block-content"><Scratch data={data} locale={locale} /></div>;
      case "shoutout": { const href = safeHref(data.url); const title = data.title || data.name || meta[locale]; return href ? <a className="public-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}><div className="public-link-icon"><Icon name="HeartHandshake" size={17} /></div><div className="public-link-copy"><strong>{title}</strong><span>{data.text}</span></div><Icon name="ArrowRight" size={16} /></a> : <div className="public-link" role="status"><div className="public-link-icon"><Icon name="HeartHandshake" size={17} /></div><div className="public-link-copy"><strong>{title}</strong><span>{data.text}</span></div><span className="status-chip">{locale === "ru" ? "Нужна настройка" : "Setup required"}</span></div>; }
      case "community": { const href = safeHref(data.url); return <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><p>{data.text}</p>{href && <a className="button button-primary" href={href} target="_blank" rel="noreferrer"><Icon name="UsersRound" size={15} />{data.label || (locale === "ru" ? "Вступить" : "Join")}</a>}</div>; }
      case "event": return <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><p>{data.text}</p>{data.endsAt && <div className="event-date"><Icon name="CalendarDays" size={15} />{new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium" }).format(new Date(data.endsAt))}</div>}<div className="block-cta"><span className="muted small">{data.location}</span><button className="button button-primary" onClick={() => onLead?.(block)}>{data.label || (locale === "ru" ? "Зарегистрироваться" : "Register")}</button></div></div>;
      case "custom_code": return <iframe className="code-frame" title={data.title || "Custom widget"} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={data.html || ""} />;
      case "form": return <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><p>{data.text}</p><button className="button button-primary" onClick={() => onLead?.(block)}><Icon name="Send" size={15} />{data.label || (locale === "ru" ? "Отправить" : "Send")}</button></div>;
      case "booking": { const item = items.find(candidate => data.itemIds?.includes(candidate.id) && candidate.kind === "service"); return <div className="public-block-content"><h3>{data.title || meta[locale]}</h3><p>{data.text}</p><div className="block-cta"><span className="muted small"><Icon name="CalendarClock" size={14} /> {item ? formatMoney(item.price, item.currency, locale) : (locale === "ru" ? "Выберите время" : "Choose a time")}</span><button className="button button-primary" onClick={() => onBook?.(item, block)}>{data.label || (locale === "ru" ? "Записаться" : "Book")}</button></div></div>; }
      default: return <div className="public-block-content"><h3>{meta[locale]}</h3></div>;
    }
  })();

  if (editor) {
    const editorBlock = block as Block;
    return <div className={`editor-block ${block.type} ${block.width} ${block.hidden ? "is-hidden" : ""}`} onClick={() => onSelect?.(editorBlock)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(editorBlock); } }} role="button" tabIndex={0} aria-label={`${labelFor(block.type, locale)}: ${plain(data.title || data.name || "")}`}>
      <div className="block-toolbar" onClick={event => event.stopPropagation()}><button className="mini-button" onClick={() => onDuplicate?.(editorBlock)} aria-label={locale === "ru" ? "Дублировать блок" : "Duplicate block"}><Icon name="Copy" size={13} /></button><button className="mini-button" onClick={() => onToggleHidden?.(editorBlock)} aria-label={editorBlock.hidden ? (locale === "ru" ? "Показать блок" : "Show block") : (locale === "ru" ? "Скрыть блок" : "Hide block")}><Icon name={editorBlock.hidden ? "Eye" : "EyeOff"} size={13} /></button><button className="mini-button" onClick={() => onDelete?.(editorBlock)} aria-label={locale === "ru" ? "Удалить блок" : "Delete block"}><Icon name="Trash2" size={13} /></button></div>
      <span className="editor-block-kicker"><Icon name={meta.icon} size={14} />{meta[locale]}</span>
      {block.type === "profile" ? <div className="block-preview-profile"><div className="avatar">{initials(data.name)}</div><div><h3>{data.name || data.title}</h3><p>{data.profession || plain(data.text)}</p></div></div> : <><h3>{data.title || data.name || meta[locale]}</h3>{(data.text || data.subtitle) && <p>{plain(data.text || data.subtitle)}</p>}{block.paid && <span className="editor-paid-badge"><Icon name="LockKeyhole" size={12} />{locale === "ru" ? "Платный" : "Paid"}</span>}</>}
    </div>;
  }
  return <article id={`block-${block.id}`} {...effects} style={effectStyle} onClickCapture={recordAction} className={`public-block appearance-block ${block.type} ${block.width} ${block.hidden ? "library-hidden" : ""}`}>{content}{library && block.hidden && <div className="library-label"><Icon name="Eye" size={12} />{locale === "ru" ? "Скрыт на странице · доступ сохранён" : "Hidden on page · access retained"}</div>}</article>;
}
