import type { Block, Locale } from "@/lib/types";
import { Icon } from "./pager-icon";

export function DiscoveryFields({ block, locale, onUpdate }: { block: Block; locale: Locale; onUpdate: (block: Block) => void }) {
  const ru = locale === "ru";
  const update = (patch: Partial<Block["data"]>) => onUpdate({ ...block, data: { ...block.data, ...patch } });
  if (block.type === "faq") return <div className="side-section">
    <span className="side-label">{ru ? "Вопросы посетителей" : "Visitor questions"}</span>
    {(block.data.items ?? []).map((item, index) => <div className="faq-editor-item" key={item.id ?? index}>
      <label className="field"><span className="side-label">{ru ? "Вопрос" : "Question"} {index + 1}</span><input maxLength={500} value={item.title ?? ""} onChange={event => update({ items: block.data.items?.map((entry, i) => i === index ? { ...entry, title: event.target.value } : entry) })} /></label>
      <label className="field"><span className="side-label">{ru ? "Ответ" : "Answer"}</span><textarea maxLength={20_000} value={item.text ?? ""} onChange={event => update({ items: block.data.items?.map((entry, i) => i === index ? { ...entry, text: event.target.value } : entry) })} /></label>
      <button className="button button-secondary" onClick={() => update({ items: block.data.items?.filter((_, i) => i !== index) })}><Icon name="Trash2" size={15} />{ru ? "Удалить вопрос" : "Remove question"}</button>
    </div>)}
    <button className="button button-secondary" disabled={(block.data.items?.length ?? 0) >= 100} onClick={() => update({ items: [...(block.data.items ?? []), { id: crypto.randomUUID(), title: "", text: "" }] })}><Icon name="Plus" size={15} />{ru ? "Добавить вопрос" : "Add a question"}</button>
  </div>;
  if (block.type === "profile") return <div className="side-section">
    <label className="field"><span className="side-label">{ru ? "Город или регион работы" : "City or service area"}</span><input maxLength={500} value={block.data.location ?? ""} onChange={event => update({ location: event.target.value })} placeholder={ru ? "Например, Алматы · онлайн" : "For example, London · online"} /></label>
    <label className="field"><span className="side-label">{ru ? "Ссылка на фото автора" : "Author photo URL"}</span><input type="url" maxLength={2048} value={block.data.avatar ?? ""} onChange={event => update({ avatar: event.target.value })} placeholder="https://…" /></label>
  </div>;
  if (["booking", "form", "messenger", "link"].includes(block.type)) return <div className="side-section"><label className="field"><span className="side-label">{ru ? "Текст кнопки" : "Button label"}</span><input maxLength={80} value={block.data.label ?? ""} onChange={event => update({ label: event.target.value })} placeholder={ru ? "Например, Обсудить мою задачу" : "For example, Discuss my project"} /></label></div>;
  return null;
}
