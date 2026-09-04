"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Locale } from "@/lib/types";

export function RichTextEditor({ value, onChange, locale, label }: { value: string; onChange: (html: string) => void; locale: Locale; label: string }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4] }, horizontalRule: false, link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto", "tel"], HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } } })],
    immediatelyRender: false,
    content: value,
    editorProps: { attributes: { class: "rich-text editor-prose", role: "textbox", "aria-label": label, "aria-multiline": "true" } },
    onUpdate: ({ editor: current }) => onChangeRef.current(current.getHTML()),
  });
  useEffect(() => { if (editor && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false }); }, [editor, value]);
  const active = useEditorState({ editor, selector: ({ editor: current }) => ({ bold: current?.isActive("bold"), italic: current?.isActive("italic"), bullet: current?.isActive("bulletList"), link: current?.isActive("link") }) });
  const ru = locale === "ru";
  const applyLink = () => {
    if (!editor) return;
    if (!url.trim()) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); return; }
    try {
      const parsed = new URL(url.trim());
      if (!["https:", "http:", "mailto:", "tel:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
      editor.chain().focus().extendMarkRange("link").setLink({ href: parsed.href }).run(); setLinkOpen(false); setError("");
    } catch { setError(ru ? "Введите ссылку https://, mailto: или tel:" : "Use an https://, mailto: or tel: link"); }
  };
  return <div className="rich-editor"><div className="rich-toolbar" role="toolbar" aria-label={ru ? "Форматирование текста" : "Text formatting"}>
    <button type="button" aria-pressed={active?.bold ?? false} aria-label={ru ? "Жирный" : "Bold"} disabled={!editor} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
    <button type="button" aria-pressed={active?.italic ?? false} aria-label={ru ? "Курсив" : "Italic"} disabled={!editor} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
    <button type="button" aria-pressed={active?.bullet ?? false} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}>{ru ? "Список" : "List"}</button>
    <button type="button" aria-pressed={active?.link ?? false} disabled={!editor} onClick={() => { setUrl(editor?.getAttributes("link").href ?? ""); setLinkOpen(open => !open); }}>{ru ? "Ссылка" : "Link"}</button>
    <button type="button" aria-label={ru ? "Отменить изменение" : "Undo"} disabled={!editor} onClick={() => editor?.chain().focus().undo().run()}>↶</button>
  </div><EditorContent editor={editor} />{linkOpen && <div className="rich-link-form"><label className="field"><span className="side-label">{ru ? "Адрес ссылки (пустое поле удаляет ссылку)" : "Link URL (empty removes link)"}</span><input type="text" inputMode="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…" /></label><button type="button" className="button button-secondary" onClick={applyLink}>{ru ? "Применить" : "Apply"}</button>{error && <p role="alert">{error}</p>}</div>}</div>;
}
