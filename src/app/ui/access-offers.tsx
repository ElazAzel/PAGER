"use client";

import type { AccessPrice, Locale } from "@/lib/types";
import { accessOfferOptions, type AccessOfferMode } from "@/lib/commerce";
import { formatMoney } from "@/lib/blocks";

export function AccessOfferButtons({ pricing, locale, onSelect }: { pricing: AccessPrice; locale: Locale; onSelect: (mode: AccessOfferMode) => void }) {
  const offers = accessOfferOptions(pricing);
  const ru = locale === "ru";
  if (!offers.length) return null;
  return <div className="offer-options" role="group" aria-label={ru ? "Варианты доступа" : "Access options"}>
    {offers.map(offer => {
      const label = offer.mode === "monthly" ? (ru ? "Подписка" : "Subscription") : (ru ? "Разовая покупка" : "One-time purchase");
      const price = offer.mode === "monthly"
        ? formatMoney(offer.amount, offer.currency, locale) + " / " + (ru ? "мес." : "mo")
        : formatMoney(offer.amount, offer.currency, locale);
      return <button key={offer.mode} type="button" className={"button " + (offer.mode === "monthly" ? "button-secondary" : "button-primary")} aria-label={label + ": " + price} onClick={() => onSelect(offer.mode)}>
        <span>{label}</span>
        <strong>{price}</strong>
      </button>;
    })}
  </div>;
}
