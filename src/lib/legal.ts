import type { Locale } from "./types";

type Environment = Readonly<Record<string, string | undefined>>;

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LegalConfig = {
  configured: boolean;
  operatorName: string | null;
  supportEmail: string | null;
};

export function legalConfig(env: Environment = process.env): LegalConfig {
  const operatorName = env.PAGER_OPERATOR_NAME?.trim() || null;
  const candidate = env.PAGER_SUPPORT_EMAIL?.trim().toLowerCase() || null;
  const supportEmail = candidate && validEmail.test(candidate) && !candidate.endsWith(".invalid")
    ? candidate
    : null;

  if (!operatorName || !supportEmail) {
    return { configured: false, operatorName: null, supportEmail: null };
  }

  return { configured: true, operatorName, supportEmail };
}

export function paymentTerms(locale: Locale, enabled: boolean): string {
  if (locale === "ru") {
    return enabled
      ? "Онлайн-оплата проводится создателем через его подключённый аккаунт Stripe Connect. Условия возврата и исполнения конкретного предложения указывает создатель."
      : "Онлайн-оплата через PAGER сейчас отключена. Заявка или бронирование сами по себе не создают платёж, возврат или обязательство по поставке.";
  }

  return enabled
    ? "Online payment is processed by the creator through their connected Stripe Connect account. The creator states the refund and fulfilment terms for each offer."
    : "Online payment through PAGER is currently disabled. An enquiry or booking does not by itself create a payment, refund, or fulfilment obligation.";
}
