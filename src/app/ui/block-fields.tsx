"use client";

import type { Block, BlockData, CatalogItem, Locale } from "@/lib/types";
import { formatMoney } from "@/lib/blocks";
import { MediaField } from "./editor-media";
import { RichTextEditor } from "./rich-text-editor";

export function DateTimeField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string | undefined) => void }) {
  const date = value ? new Date(value) : null;
  const local = date && Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
  return <label className="field"><span className="side-label">{label}</span><input type="datetime-local" value={local} onChange={event => { const next = new Date(event.target.value); onChange(Number.isFinite(next.getTime()) ? next.toISOString() : undefined); }} /></label>;
}

export function ItemPicker({ items, value = [], onChange, locale, single = false }: { items: CatalogItem[]; value?: string[]; onChange: (ids: string[]) => void; locale: Locale; single?: boolean }) {
  const ru = locale === "ru";
  return <fieldset className="item-picker"><legend className="side-label">{ru ? "Предложения из каталога" : "Offers from your catalog"}</legend>{items.length ? items.map(item => <label className="item-choice" key={item.id}><input type="checkbox" checked={value.includes(item.id)} onChange={event => onChange(event.target.checked ? (single ? [item.id] : [...value, item.id]) : value.filter(id => id !== item.id))} /><span><strong>{item.title}</strong><small>{formatMoney(item.price, item.currency, locale)}</small></span></label>) : <p className="small muted">{ru ? "Сначала добавьте предложение во вкладке «Каталог»." : "Add an offer in the Catalog tab first."}</p>}</fieldset>;
}

export function BlockFields({ block, pageId, items, locale, onChange }: { block: Block; pageId: string; items: CatalogItem[]; locale: Locale; onChange: (patch: Partial<BlockData>) => void }) {
  const ru = locale === "ru";
  const data = block.data;
  const field = (key: keyof BlockData, label: string, multiline = false, placeholder?: string) => <label className="field" key={key}><span className="side-label">{label}</span>{multiline ? <textarea maxLength={key === "html" || key === "code" ? 100_000 : 20_000} value={String(data[key] ?? "")} onChange={event => onChange({ [key]: event.target.value })} /> : <input maxLength={["url", "calLink"].includes(key) ? 2048 : 500} value={String(data[key] ?? "")} placeholder={placeholder} onChange={event => onChange({ [key]: event.target.value })} />}</label>;
  const text = () => field("text", ru ? "Описание" : "Description", true);
  const rich = (label = ru ? "Описание" : "Description") => <div className="field"><span className="side-label">{label}</span><RichTextEditor value={data.text ?? ""} onChange={value => onChange({ text: value })} locale={locale} label={label} /></div>;
  const url = () => field("url", ru ? "Адрес ссылки" : "Link URL", false, "https://…");
  const label = () => field("label", ru ? "Текст кнопки" : "Button label");
  const media = (key: "image" | "avatar" | "beforeImage" | "afterImage", name: string) => <MediaField key={key} pageId={pageId} locale={locale} value={data[key]} label={name} onChange={value => onChange({ [key]: value })} />;
  const itemPicker = (kind?: CatalogItem["kind"], single = false) => <ItemPicker items={kind ? items.filter(item => item.kind === kind) : items} value={data.itemIds} onChange={itemIds => onChange({ itemIds })} locale={locale} single={single} />;
  const repeat = (type: "faq" | "socials" | "carousel") => {
    const entries = data.items ?? [];
    const update = (index: number, patch: Partial<NonNullable<BlockData["items"]>[number]>) => onChange({ items: entries.map((item, at) => at === index ? { ...item, ...patch } : item) });
    return <div className="repeated-fields">{entries.map((entry, index) => <fieldset key={entry.id ?? index} className="repeated-field"><legend>{type === "faq" ? (ru ? "Вопрос" : "Question") : type === "socials" ? (ru ? "Ссылка" : "Link") : (ru ? "Изображение" : "Image")} {index + 1}</legend>
      <label className="field"><span className="side-label">{type === "faq" ? (ru ? "Вопрос" : "Question") : (ru ? "Название" : "Title")}</span><input maxLength={500} value={entry.title ?? ""} onChange={event => update(index, { title: event.target.value })} /></label>
      {type === "faq" ? <RichTextEditor label={ru ? "Ответ" : "Answer"} locale={locale} value={entry.text ?? ""} onChange={value => update(index, { text: value })} /> : <>
        <label className="field"><span className="side-label">{ru ? "Ссылка" : "Link"}</span><input maxLength={2048} value={entry.url ?? ""} onChange={event => update(index, { url: event.target.value })} placeholder="https://…" /></label>
        {type === "carousel" ? <><MediaField pageId={pageId} locale={locale} value={entry.image} label={ru ? "Фото или GIF" : "Image or GIF"} onChange={image => update(index, { image })} /><label className="field"><span className="side-label">{ru ? "Описание изображения" : "Image description"}</span><input maxLength={500} value={entry.alt ?? ""} placeholder={ru ? "Что изображено" : "What is shown"} onChange={event => update(index, { alt: event.target.value })} /></label></> : <>
          <label className="field"><span className="side-label">{ru ? "Значок" : "Icon"}</span><select value={!["telegram", "instagram", "whatsapp", "youtube", "linkedin", "website"].includes(entry.icon ?? "") ? "custom" : entry.icon} onChange={event => update(index, { icon: event.target.value === "custom" ? "" : event.target.value })}><option value="telegram">Telegram</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="youtube">YouTube</option><option value="linkedin">LinkedIn</option><option value="website">{ru ? "Сайт" : "Website"}</option><option value="custom">{ru ? "Свой значок" : "Custom icon"}</option></select></label>
          {(!entry.icon || /[/:]/.test(entry.icon) || entry.icon === "custom") && <MediaField pageId={pageId} locale={locale} value={entry.icon} label={ru ? "Изображение значка" : "Icon image"} onChange={icon => update(index, { icon })} />}
        </>}
      </>}
      <div className="repeat-actions"><button type="button" className="button button-secondary" disabled={index === 0} onClick={() => { const next = [...entries]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange({ items: next }); }}>{ru ? "Выше" : "Move up"}</button><button type="button" className="button button-danger" onClick={() => onChange({ items: entries.filter((_, at) => at !== index) })}>{ru ? "Удалить" : "Remove"}</button></div>
    </fieldset>)}<button type="button" className="button button-secondary" disabled={entries.length >= 100} onClick={() => onChange({ items: [...entries, { id: crypto.randomUUID(), title: "", ...(type === "socials" ? { icon: "website", url: "" } : {}) }] })}>{ru ? "Добавить" : "Add"}</button></div>;
  };
  const content = (() => {
    switch (block.type) {
      case "profile": return <>{field("name", ru ? "Имя" : "Name")}{field("profession", ru ? "Специализация" : "Specialty")}{media("avatar", ru ? "Фото автора" : "Profile photo")}{field("location", ru ? "Город или регион работы" : "City or service area")}{rich()}{label()}{url()}</>;
      case "text": return rich(ru ? "Текст" : "Text");
      case "image": return <>{media("image", ru ? "Изображение или GIF" : "Image or GIF")}{field("alt", ru ? "Описание изображения" : "Image description", false, ru ? "Что изображено" : "What is shown")}</>;
      case "separator": return <p className="small muted">{ru ? "Разделитель создаёт пространство между блоками. Ширина настраивается ниже." : "A divider adds space between blocks. Choose its width below."}</p>;
      case "link": return <>{text()}{url()}{label()}</>;
      case "socials": return repeat("socials");
      case "video": return <>{field("url", ru ? "Ссылка на видео (YouTube, Vimeo или MP4)" : "Video URL (YouTube, Vimeo or MP4)", false, "https://…")}{media("image", ru ? "Обложка" : "Poster")}{text()}</>;
      case "carousel": return repeat("carousel");
      case "before_after": return <>{media("beforeImage", ru ? "До" : "Before")}{field("beforeAlt", ru ? "Описание «до»" : "Before description", false, ru ? "Что было до" : "What was before")}{media("afterImage", ru ? "После" : "After")}{field("afterAlt", ru ? "Описание «после»" : "After description", false, ru ? "Что стало после" : "What changed after")}</>;
      case "testimonial": return <>{rich(ru ? "Настоящий отзыв клиента" : "Client testimonial")}{field("name", ru ? "Имя клиента" : "Client name")}{field("subtitle", ru ? "Услуга или проект" : "Service or project")}{media("avatar", ru ? "Фото клиента" : "Client photo")}</>;
      case "faq": return repeat("faq");
      case "map": return <>{field("address", ru ? "Адрес" : "Address")}{field("url", ru ? "Ссылка на карту" : "Map link", false, "https://…")}</>;
      case "messenger": case "community": return <>{text()}{url()}{label()}{block.type === "community" && <p className="small muted">{ru ? "Ссылка приглашает в сообщество. Состав участников управляется в самом сообществе." : "This is an invitation link. Membership is managed in the community itself."}</p>}</>;
      case "download": return <>{text()}<MediaField pageId={pageId} locale={locale} value={data.fileId} file label={ru ? "Файл для скачивания · до 10 МБ" : "Download file · up to 10 MB"} onChange={fileId => onChange({ fileId: fileId || undefined })} />{label()}</>;
      case "pricing": return itemPicker("service");
      case "catalog": return itemPicker();
      case "product": return itemPicker(undefined, true);
      case "countdown": return <><DateTimeField label={ru ? "Дата и время окончания (ваш часовой пояс)" : "Ends at (your timezone)"} value={data.endsAt} onChange={endsAt => onChange({ endsAt })} />{text()}</>;
      case "scratch": return <>{text()}{field("code", ru ? "Бонус после открытия" : "Bonus to reveal", true)}</>;
      case "shoutout": return <>{field("name", ru ? "Имя автора" : "Creator name")}{url()}{text()}{media("avatar", ru ? "Фото автора" : "Creator photo")}</>;
      case "event": return <>{text()}<DateTimeField label={ru ? "Начало (ваш часовой пояс)" : "Starts at (your timezone)"} value={data.endsAt} onChange={endsAt => onChange({ endsAt })} />{field("location", ru ? "Место" : "Location")}<label className="field"><span className="side-label">{ru ? "Лимит участников (необязательно)" : "Capacity (optional)"}</span><input type="number" min={0} max={1_000_000} value={data.capacity ?? ""} onChange={event => onChange({ capacity: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>{label()}{itemPicker("ticket")}</>;
      case "custom_code": return <>{field("html", "HTML / JavaScript", true)}<p className="small muted">{ru ? "Виджет выполняется в изолированной рамке без доступа к сессии PAGER." : "The widget runs in an isolated frame without access to the PAGER session."}</p></>;
      case "form": return <>{text()}{label()}<p className="small muted">{ru ? "Форма собирает имя, email и сообщение; обращения появятся в разделе «Клиенты»." : "The form collects name, email and message; inquiries appear in Clients."}</p></>;
      case "booking": return <>{text()}{field("calLink", ru ? "Ссылка события Cal.com" : "Cal.com event link", false, "https://cal.com/name/session")}<label className="field"><span className="side-label">{ru ? "ID типа события Cal.com" : "Cal.com event type ID"}</span><input type="number" min={1} value={data.eventTypeId ?? ""} onChange={event => onChange({ eventTypeId: event.target.value ? Number(event.target.value) : undefined })} /></label>{itemPicker("service", true)}{label()}<p className="small muted">{ru ? "Подключите Cal.com в настройках. Оплата связанной услуги доступна после записи, если включены платежи." : "Connect Cal.com in Settings. Payment for the linked service follows booking when payments are enabled."}</p></>;
    }
  })();
  return <div className="side-section">{field("title", ru ? "Заголовок" : "Title")}{content}</div>;
}
