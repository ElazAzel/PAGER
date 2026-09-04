"use client";

import { useId, useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { DndContext, closestCenter, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block, BlockType, DashboardData, Locale, Page } from "@/lib/types";
import { BLOCK_TYPES } from "@/lib/types";
import { BLOCK_GROUPS, BLOCK_META, createBlock } from "@/lib/blocks";
import { t } from "@/lib/i18n";
import { Icon } from "./pager-icon";
import { BlockRenderer } from "./block-renderer";
import { AppearanceControls, BlockAppearanceControls } from "./appearance-controls";
import { AppearanceSurface } from "./appearance-surface";
import { BlockFields } from "./block-fields";
import { moveBlock, type DraftState } from "./editor-draft";
import { canPublishPage, pagePublishChecks } from "@/lib/page-readiness";

const desktopQuery = "(min-width: 960px)";
const subscribeDesktop = (notify: () => void) => { const query = window.matchMedia(desktopQuery); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); };

export function EditorDialog({ title, description, closeLabel = "Close / Закрыть", onClose, children, wide = false }: { title: string; description?: string; closeLabel?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const descriptionId = useId();
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="modal-backdrop editor-overlay" /><Dialog.Content className={`modal editor-dialog ${wide ? "modal-wide" : ""}`} aria-describedby={description ? descriptionId : undefined}><div className="modal-handle" /><div className="modal-heading"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description id={descriptionId}>{description}</Dialog.Description>}</div><Dialog.Close asChild><button type="button" className="icon-button" aria-label={closeLabel}><Icon name="X" /></button></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function PageSettings({ page, locale, onUpdate, payments }: { page: Page; locale: Locale; onUpdate: (page: Page) => void; payments: boolean }) {
  const ru = locale === "ru";
  const update = (patch: Partial<Page>) => onUpdate({ ...page, ...patch });
  const price = (key: "oneTime" | "monthly", raw: string) => update({ pricing: { ...page.pricing, [key]: Number(raw) > 0 ? Math.round(Number(raw) * 100) : undefined } });
  return <>
    <AppearanceControls page={page} locale={locale} onChange={onUpdate} />
    <div className="side-section">
      <label className="field"><span className="side-label">{t(locale, "pageTitle")}</span><input maxLength={200} value={page.title} onChange={event => update({ title: event.target.value })} /></label>
      <label className="field"><span className="side-label">{t(locale, "description")}</span><textarea maxLength={2000} value={page.description} onChange={event => update({ description: event.target.value })} /></label>
      <label className="field"><span className="side-label">{t(locale, "pageAddress")}</span><input maxLength={64} value={page.slug} onChange={event => update({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} autoCapitalize="none" autoCorrect="off" /></label>
      <label className="field"><span className="side-label">{t(locale, "language")}</span><select value={page.locale} onChange={event => update({ locale: event.target.value as Locale })}><option value="ru">Русский</option><option value="en">English</option></select></label>
    </div>
    <div className="side-section">
      {payments ? <>
        <div className="switch-row"><span>{t(locale, "wholePage")}</span><button type="button" className={`switch ${page.paid ? "on" : ""}`} onClick={() => update({ paid: !page.paid })} aria-pressed={page.paid} aria-label={t(locale, "wholePage")} /></div>
        {page.paid && <>
          <PriceFields locale={locale} pricing={page.pricing} onPrice={price} onCurrency={currency => update({ pricing: { ...page.pricing, currency } })} />
          <label className="field"><span className="side-label">{t(locale, "teaser")}</span><textarea maxLength={2000} value={page.teaser} onChange={event => update({ teaser: event.target.value })} /></label>
        </>}
      </> : <p className="small muted">{ru ? "На этом этапе пилота страница доступна бесплатно. Платежи отключены." : "During this pilot stage your page is free to access. Payments are disabled."}</p>}
    </div>
  </>;
}

function PriceFields({ locale, pricing, onPrice, onCurrency }: { locale: Locale; pricing: Page["pricing"]; onPrice: (key: "oneTime" | "monthly", raw: string) => void; onCurrency: (currency: string) => void }) {
  return <><label className="field"><span className="side-label">{locale === "ru" ? "Валюта" : "Currency"}</span><select value={pricing.currency} onChange={event => onCurrency(event.target.value)}>{["USD", "EUR", "GBP"].map(currency => <option key={currency}>{currency}</option>)}</select></label><div className="field-row">{(["oneTime", "monthly"] as const).map(key => <label className="field" key={key}><span className="side-label">{t(locale, key)}</span><input type="number" min="0.01" step="0.01" value={pricing[key] ? pricing[key]! / 100 : ""} onChange={event => onPrice(key, event.target.value)} /></label>)}</div></>;
}

function BlockProperties({ block, data, locale, onUpdate, onUpdatePage, onDuplicate, onArchive }: { block: Block | null; data: DashboardData; locale: Locale; onUpdate: (block: Block) => void; onUpdatePage: (page: Page) => void; onDuplicate: (block: Block) => void; onArchive: (block: Block) => void }) {
  const payments = data.capabilities?.payments ?? data.demo;
  const ru = locale === "ru";
  if (!block) return <PageSettings page={data.page} locale={locale} onUpdate={onUpdatePage} payments={payments} />;
  return <><BlockFields key={block.id} block={block} pageId={data.page.id} items={data.items} locale={locale} onChange={patch => onUpdate({ ...block, data: { ...block.data, ...patch } })} /><BlockAppearanceControls block={block} locale={locale} onChange={onUpdate} /><div className="side-section"><label className="field"><span className="side-label">{t(locale, "width")}</span><select value={block.width} onChange={event => onUpdate({ ...block, width: event.target.value as Block["width"] })}><option value="half">{t(locale, "half")}</option><option value="full">{t(locale, "full")}</option></select></label><div className="switch-row"><span>{ru ? "Показывать на странице" : "Visible on page"}</span><button type="button" className={`switch ${!block.hidden ? "on" : ""}`} onClick={() => onUpdate({ ...block, hidden: !block.hidden })} aria-pressed={!block.hidden} aria-label={ru ? "Показывать блок" : "Show block"} /></div>{payments && <><div className="switch-row"><span>{t(locale, "paidAccess")}</span><button type="button" className={`switch ${block.paid ? "on" : ""}`} onClick={() => onUpdate({ ...block, paid: !block.paid })} aria-pressed={block.paid} aria-label={t(locale, "paidAccess")} /></div>{block.paid && <><PriceFields locale={locale} pricing={block.pricing} onPrice={(key, raw) => onUpdate({ ...block, pricing: { ...block.pricing, [key]: Number(raw) > 0 ? Math.round(Number(raw) * 100) : undefined } })} onCurrency={currency => onUpdate({ ...block, pricing: { ...block.pricing, currency } })} /><label className="field"><span className="side-label">{t(locale, "teaser")}</span><textarea maxLength={2000} value={block.teaser} onChange={event => onUpdate({ ...block, teaser: event.target.value })} /></label></>}</>}</div><div className="side-actions"><button type="button" className="button button-secondary" onClick={() => onDuplicate(block)}><Icon name="Copy" size={14} />{t(locale, "duplicate")}</button><button type="button" className="button button-danger" onClick={() => onArchive(block)}><Icon name="Inbox" size={14} />{ru ? "В архив" : "Archive"}</button></div></>;
}

function SortableBlock({ block, locale, selected, onSelect, onMove, first, last }: { block: Block; locale: Locale; selected: boolean; onSelect: () => void; onMove: (delta: number) => void; first: boolean; last: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const meta = BLOCK_META[block.type];
  const ru = locale === "ru";
  const plain = (block.data.text || block.data.profession || block.data.subtitle || "").replace(/<[^>]*>/g, " ");
  return <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 3 : undefined, opacity: isDragging ? .7 : undefined }} className={`editor-block sortable-block ${block.type} ${block.width} ${selected ? "selected" : ""} ${block.hidden ? "is-hidden" : ""}`}><div className="sort-toolbar"><button ref={setActivatorNodeRef} type="button" className="sort-handle icon-button" {...attributes} {...listeners} aria-label={`${ru ? "Переместить" : "Move"}: ${block.data.title || meta[locale]}`}><span aria-hidden="true">⠿</span></button><div className="sort-moves"><button type="button" className="icon-button" disabled={first} onClick={() => onMove(-1)} aria-label={ru ? "Переместить выше" : "Move up"}>↑</button><button type="button" className="icon-button" disabled={last} onClick={() => onMove(1)} aria-label={ru ? "Переместить ниже" : "Move down"}>↓</button></div></div><button type="button" className="block-edit-button" onClick={onSelect} aria-label={`${ru ? "Настроить" : "Edit"}: ${block.data.title || meta[locale]}`}><span className="editor-block-kicker"><Icon name={meta.icon} size={14} />{meta[locale]}</span><h3>{block.type === "profile" ? block.data.name || block.data.title : block.data.title || meta[locale]}</h3>{plain && <p>{plain.slice(0, 160)}</p>}<span className="block-card-state">{block.archived ? (ru ? "В архиве" : "Archived") : block.hidden ? (ru ? "Скрыт" : "Hidden") : (ru ? "Настроить" : "Edit")}{block.paid && <Icon name="LockKeyhole" size={13} />}</span></button></section>;
}

export function BlockTypePicker({ locale, onSelect }: { locale: Locale; onSelect: (type: BlockType) => void }) {
  return <div className="block-type-grid">{BLOCK_GROUPS[locale].map((group, groupIndex) => <div key={group} style={{ display: "contents" }}><div className="eyebrow" style={{ gridColumn: "1 / -1", padding: "8px 2px 0" }}>{group}</div>{BLOCK_TYPES.filter(type => BLOCK_META[type].group === groupIndex).map(type => { const meta = BLOCK_META[type]; return <button type="button" className="block-type-button" key={type} onClick={() => onSelect(type)} aria-label={`${meta[locale]}: ${locale === "ru" ? meta.descriptionRu : meta.descriptionEn}`}><Icon name={meta.icon} size={17} /><span className="block-type-copy"><strong>{meta[locale]}</strong><small>{locale === "ru" ? meta.descriptionRu : meta.descriptionEn}</small></span></button>; })}</div>)}</div>;
}

export function SaveStatus({ state, locale, retry, reload }: { state: DraftState; locale: Locale; retry: () => void; reload: () => void }) {
  const ru = locale === "ru";
  const labels = { saved: ru ? "Сохранено" : "Saved", pending: ru ? "Есть изменения" : "Unsaved changes", saving: ru ? "Сохраняем…" : "Saving…", publishing: ru ? "Публикуем…" : "Publishing…", error: ru ? "Не сохранено" : "Not saved", conflict: ru ? "Конфликт версий" : "Version conflict" };
  return <div className={`draft-status ${state.status}`} role="status"><span><Icon name={state.status === "saved" ? "Check" : "Info"} size={14} />{labels[state.status]}</span>{state.error && <p>{state.error}</p>}{state.status === "error" && <button type="button" className="button button-secondary" onClick={retry}>{ru ? "Повторить сохранение" : "Retry save"}</button>}{state.status === "conflict" && <><p>{ru ? "Ваш ввод сохранён в этом окне. Получите актуальный черновик, чтобы выбрать, какую версию продолжить." : "Your input is kept in this window. Fetch the current draft to choose which version to continue."}</p><button type="button" className="button button-secondary" onClick={reload}>{ru ? "Получить актуальный черновик" : "Fetch current draft"}</button></>}</div>;
}

function PublishGate({ page, locale }: { page: Page; locale: Locale }) {
  const missing = pagePublishChecks(page).filter(check => !check.ok);
  if (!missing.length) return null;
  const labels = locale === "ru" ? { identity: "Заполните понятное описание", profile: "Добавьте содержательный профиль", nextStep: "Добавьте следующий шаг для посетителя" } : { identity: "Add a clear page description", profile: "Add a useful profile", nextStep: "Add a clear next step for visitors" };
  return <div id="publish-hint" className="notice publish-hint" role="status"><Icon name="Info" size={16} /><span><strong>{locale === "ru" ? "До публикации осталось:" : "Before you publish:"}</strong> {missing.map(check => labels[check.key]).join(" · ")}</span></div>;
}
export function PageView({ data, locale, onPage, publish, saveState, retry = () => undefined, reload = () => undefined }: { data: DashboardData; locale: Locale; onPage: (page: Page) => void; publish: () => Promise<void>; saveState: DraftState; retry?: () => void; reload?: () => void }) {
  const [preview, setPreview] = useState(false);
  const [replay, setReplay] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => false);
  const selected = data.page.blocks.find(block => block.id === selectedId) ?? null;
  const ru = locale === "ru";
  const visible = data.page.blocks.filter(block => !block.archived);
  const archived = data.page.blocks.filter(block => block.archived);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 7 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const updateBlock = (block: Block) => onPage({ ...data.page, blocks: data.page.blocks.map(current => current.id === block.id ? block : current) });
  const add = (type: BlockType) => { const block = createBlock(type, locale); onPage({ ...data.page, blocks: [...data.page.blocks, block] }); setSelectedId(block.id); setPanelOpen(true); setAddOpen(false); };
  const duplicate = (block: Block) => { const copy = { ...structuredClone(block), id: crypto.randomUUID(), archived: false }; onPage({ ...data.page, blocks: data.page.blocks.flatMap(current => current.id === block.id ? [current, copy] : [current]) }); setSelectedId(copy.id); setPanelOpen(true); };
  const archive = (block: Block) => { updateBlock({ ...block, archived: true }); setSelectedId(null); setPanelOpen(false); };
  const properties = <BlockProperties block={selected} data={data} locale={locale} onUpdate={updateBlock} onUpdatePage={onPage} onDuplicate={duplicate} onArchive={archive} />;
  const publishing = saveState.status === "publishing";
  const publishReady = canPublishPage(data.page);
  return <><div className="dashboard-heading"><div><div className="eyebrow">{t(locale, "page")}</div><h1>{data.page.title || t(locale, "page")}</h1><p>{data.page.publishedAt ? `${t(locale, "published")} · /${data.page.slug}` : t(locale, "notPublished")}</p></div><div className="dashboard-heading-actions"><div className="editor-tabs" role="tablist" aria-label={ru ? "Режим просмотра страницы" : "Page view mode"}><button type="button" role="tab" id="editor-tab-page" aria-selected={!preview} aria-controls="editor-view-panel" className={`editor-tab ${!preview ? "active" : ""}`} onClick={() => setPreview(false)}>{t(locale, "tabPage")}</button><button type="button" role="tab" id="editor-tab-preview" aria-selected={preview} aria-controls="editor-view-panel" className={`editor-tab ${preview ? "active" : ""}`} onClick={() => setPreview(true)}>{t(locale, "preview")}</button></div><button type="button" className="button button-secondary" onClick={() => { setSelectedId(null); setPanelOpen(open => !open); }}><Icon name="Settings" size={15} />{t(locale, "style")}</button></div></div><SaveStatus state={saveState} locale={locale} retry={retry} reload={reload} />
    {!data.page.publishedAt && <div className="editor-welcome"><h2>{ru ? "Ваша первая страница" : "Your first page"}</h2><p>{ru ? "Представьтесь, добавьте способ связи и проверьте страницу перед публикацией." : "Introduce yourself, add a way to connect and preview your page before publishing."}</p><div className="welcome-actions">{(["profile", "booking", "form"] as const).filter(type => !visible.some(block => block.type === type)).map(type => <button key={type} type="button" className="button button-secondary" onClick={() => add(type)}><Icon name={BLOCK_META[type].icon} size={15} />{BLOCK_META[type][locale]}</button>)}</div></div>}
    <div id="editor-view-panel" role="tabpanel" aria-labelledby={preview ? "editor-tab-preview" : "editor-tab-page"} className="editor-grid">
      <section className="canvas-panel">
        <AppearanceSurface className="canvas-inner" appearance={data.page.appearance} accent={data.page.accent} replayKey={replay}>
          <div className="canvas-page-head"><div><div className="eyebrow">{preview ? t(locale, "preview") : t(locale, "draft")}</div><h2>{data.page.title}</h2><p>{data.page.description || t(locale, "firstSteps")}</p></div></div>
          {preview ? <>
            <div className="appearance-preview-actions">
              <p className="preview-caption">{ru ? "Предпросмотр черновика для автора. Посетители видят последнюю опубликованную версию." : "Your draft preview. Visitors see the latest published version."}</p>
              <button type="button" className="button button-secondary" onClick={() => setReplay(value => value + 1)}><span aria-hidden="true">↻</span>{ru ? "Повторить эффекты" : "Replay effects"}</button>
            </div>
            <div className="public-blocks">{visible.filter(block => !block.hidden).map((block, index) => <BlockRenderer key={block.id} block={block} locale={locale} items={data.items} slug={data.page.slug} appearance={data.page.appearance} sequence={index} />)}</div>
          </> : <>
            <p className="sort-help">{ru ? "Перетаскивайте за ⠿ или используйте стрелки. С клавиатуры: пробел, стрелки, пробел." : "Drag by ⠿ or use the arrows. Keyboard: Space, arrows, Space."}</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over) onPage({ ...data.page, blocks: moveBlock(data.page.blocks, String(active.id), String(over.id)) }); }} accessibility={{ screenReaderInstructions: { draggable: ru ? "Нажмите пробел для перемещения, стрелки для позиции, пробел для завершения, Escape для отмены." : "Press Space to pick up, arrows to move, Space to drop and Escape to cancel." } }}>
              <SortableContext items={visible.map(block => block.id)} strategy={rectSortingStrategy}>
                <div className="editor-block-grid">{visible.map((block, index) => <SortableBlock key={block.id} block={block} locale={locale} selected={selectedId === block.id} onSelect={() => { setSelectedId(block.id); setPanelOpen(true); }} onMove={delta => onPage({ ...data.page, blocks: moveBlock(data.page.blocks, block.id, visible[index + delta].id) })} first={index === 0} last={index === visible.length - 1} />)}</div>
              </SortableContext>
            </DndContext>
            {!visible.length && <div className="empty-state">{ru ? "Добавьте первый блок" : "Add your first block"}</div>}
            <button type="button" className="editor-add" onClick={() => setAddOpen(true)} disabled={data.page.blocks.length >= 100}><Icon name="CirclePlus" size={20} />{t(locale, "addBlock")}</button>
            {archived.length > 0 && <>
              <button type="button" className="button button-quiet" onClick={() => setArchiveOpen(open => !open)} aria-expanded={archiveOpen}>{ru ? "Архив" : "Archive"} · {archived.length}</button>
              {archiveOpen && <div className="archive-list">{archived.map(block => <div key={block.id}><span>{block.data.title || BLOCK_META[block.type][locale]}</span><button type="button" className="button button-secondary" onClick={() => updateBlock({ ...block, archived: false })}>{ru ? "Восстановить" : "Restore"}</button></div>)}</div>}
            </>}
          </>}
          <PublishGate page={data.page} locale={locale} />
          <button type="button" className="button button-primary canvas-publish" onClick={() => void publish()} disabled={publishing || !publishReady || saveState.status === "conflict"} aria-describedby={!publishReady ? "publish-hint" : undefined}><Icon name="Globe2" size={16} />{publishing ? (ru ? "Публикуем…" : "Publishing…") : t(locale, "publish")}</button>
        </AppearanceSurface>
      </section>
      {desktop && <aside className="editor-side-wrap"><div className="editor-side"><div className="side-title"><h3>{selected ? BLOCK_META[selected.type][locale] : t(locale, "style")}</h3></div>{properties}</div></aside>}
    </div>
    {!desktop && panelOpen && <EditorDialog title={selected ? BLOCK_META[selected.type][locale] : t(locale, "style")} closeLabel={t(locale, "close")} onClose={() => setPanelOpen(false)}>{properties}</EditorDialog>}
    {addOpen && <EditorDialog wide title={t(locale, "addBlock")} description={ru ? "Выберите блок и добавьте своё содержание." : "Choose a block and add your content."} closeLabel={t(locale, "close")} onClose={() => setAddOpen(false)}><BlockTypePicker locale={locale} onSelect={add} /></EditorDialog>}
  </>;
}
