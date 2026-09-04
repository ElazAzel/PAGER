"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminMfaState } from "@/lib/server/admin";
import styles from "../../ui/admin-panel.module.css";

export function AdminMfaPanel({ initial }: { initial: AdminMfaState }) {
  const router = useRouter();
  const [locale, setLocale] = useState(initial.locale);
  const [factorId, setFactorId] = useState(initial.factors[0]?.id ?? "");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(initial.verified);
  const copy = (ru: string, en: string) => locale === "ru" ? ru : en;

  async function submit(action: "enroll" | "verify") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/mfa", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "enroll" ? { action } : { action, factorId, code }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : copy("Не удалось подтвердить второй фактор.", "Could not verify the second factor."));
      if (action === "enroll") { setFactorId(payload.factorId); setQrCode(payload.qrCode); }
      else { setQrCode(""); setCode(""); setVerified(true); router.push("/admin"); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : copy("Ошибка соединения. Повторите попытку.", "Connection failed. Try again.")); }
    finally { setBusy(false); }
  }

  return <main className={`${styles.shell} ${styles.mfaShell}`} lang={locale}>
    <header className={styles.header}><Link href="/" className={styles.brand}>PAGER</Link><button className={styles.locale} onClick={() => setLocale(locale === "ru" ? "en" : "ru")}>{locale === "ru" ? "EN" : "RU"}</button></header>
    <div className={styles.heading}><div><div className={styles.eyebrow}>{copy("Вход администратора", "Administrator sign-in")}</div><h1>{copy("Второй фактор", "Second factor")}</h1><p>{copy("Подтвердите вход кодом из приложения-аутентификатора.", "Confirm sign-in with a code from your authenticator app.")}</p></div></div>
    {initial.demo && <p className={styles.demo}>{copy("Локальный деморежим: MFA здесь явно отключён. Доступ определяется отдельным демосписком администраторов.", "Local demo: MFA is explicitly bypassed here. Access uses a separate demo administrator allowlist.")}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {verified ? <Link className={styles.refresh} href="/admin">{copy("Открыть админку", "Open admin")}</Link> : <section className={styles.card} aria-busy={busy}>
      {!factorId ? <><h2>{copy("Подключите аутентификатор", "Connect an authenticator")}</h2><p className={styles.caption}>{copy("Добавьте PAGER в приложение-аутентификатор, затем введите шестизначный код. Настройка доступна только вашему назначенному аккаунту.", "Add PAGER to your authenticator app, then enter the six-digit code. Setup is available only to your assigned account.")}</p><button className={styles.actionButton} type="button" disabled={busy} onClick={() => void submit("enroll")}>{copy("Настроить второй фактор", "Set up second factor")}</button></> : <form onSubmit={event => { event.preventDefault(); void submit("verify"); }}>
        {qrCode && <div className={styles.qr}><p>{copy("Отсканируйте QR-код своим аутентификатором.", "Scan this QR code with your authenticator.")}</p><Image src={qrCode.startsWith("data:image/svg+xml") ? qrCode : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`} width={240} height={240} unoptimized alt={copy("QR-код настройки второго фактора", "Second factor setup QR code")} /></div>}
        {initial.factors.length > 1 && <label className={styles.field}>{copy("Аутентификатор", "Authenticator")}<select value={factorId} onChange={event => setFactorId(event.target.value)} disabled={busy}>{initial.factors.map((factor, index) => <option key={factor.id} value={factor.id}>{copy("Аутентификатор", "Authenticator")} {index + 1}</option>)}</select></label>}
        <label className={styles.field}>{copy("Код из приложения", "Code from your app")}<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} required disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} /></label>
        <button className={styles.actionButton} type="submit" disabled={busy || code.length !== 6}>{busy ? copy("Проверяем…", "Verifying…") : copy("Подтвердить вход", "Verify sign-in")}</button>
      </form>}
      <p className={styles.finePrint}>{copy("Если потеряли аутентификатор, обратитесь к владельцу развёртывания для восстановления доступа через Supabase. Повторный вход по почте не обходит MFA.", "If you lose your authenticator, contact the deployment owner for recovery through Supabase. Signing in by email again does not bypass MFA.")}</p>
    </section>}
  </main>;
}
