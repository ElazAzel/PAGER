"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/lib/types";
import { toErrorMessage } from "./api";
import { Icon } from "./pager-icon";

export function MediaField({ pageId, locale, value, onChange, label, file = false, accept = "image/png,image/jpeg,image/webp,image/gif" }: { pageId: string; locale: Locale; value?: string; onChange: (value: string) => void; label: string; file?: boolean; accept?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const ru = locale === "ru";
  const upload = async (selected: File) => {
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("pageId", pageId); form.set("file", selected);
      const response = await fetch("/api/assets", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || (ru ? "Не удалось загрузить файл" : "Upload failed"));
      const assetId = result.asset?.id ?? result.id;
      const uploadedUrl = result.url ?? (assetId ? `/api/assets/${assetId}` : undefined);
      if (!assetId || !uploadedUrl) throw new Error(ru ? "Сервер не вернул загруженный файл" : "Upload response is incomplete");
      onChange(file ? assetId : uploadedUrl);
    } catch (err) { setError(toErrorMessage(err)); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return <div className="media-field"><label className="field"><span className="side-label">{label}</span>{!file && <input type="text" inputMode="url" maxLength={2048} value={value ?? ""} onChange={event => onChange(event.target.value)} placeholder="https://…" />}</label><input ref={input} type="file" accept={file ? undefined : accept} className="sr-only" tabIndex={-1} onChange={event => { const selected = event.target.files?.[0]; if (selected) void upload(selected); }} /><div className="media-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => input.current?.click()}><Icon name="Upload" size={15} />{busy ? (ru ? "Загружаем…" : "Uploading…") : (ru ? "Загрузить файл" : "Upload file")}</button>{value && <button type="button" className="button button-quiet" disabled={busy} onClick={() => onChange("")}>{ru ? "Убрать" : "Remove"}</button>}</div>{file && value && <p className="small muted">{ru ? "Файл прикреплён" : "File attached"}</p>}{error && <p className="error-notice" role="alert">{error}</p>}</div>;
}
