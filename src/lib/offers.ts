import type { AccessOffer, Block, Page } from "./types";

// The saved page owns current offers; an Order keeps the accepted price immutable.
// This projection works on public teasers without requiring the protected block body.
export function accessOffers(
  page: Pick<Page, "id" | "paid" | "pricing" | "revision">,
  block?: Pick<Block, "id" | "paid" | "pricing">,
): AccessOffer[] {
  const target = block ?? page;
  if (!target.paid) return [];
  const scope = block ? "block" : "page";
  return (["one_time", "monthly"] as const).flatMap(mode => {
    const amount = mode === "one_time" ? target.pricing.oneTime : target.pricing.monthly;
    if (!amount || !Number.isSafeInteger(amount) || amount < 1) return [];
    return [{
      id: `${page.id}:${block?.id ?? "page"}:${mode}`,
      pageId: page.id, ...(block ? { blockId: block.id } : {}), scope, mode,
      amount, currency: target.pricing.currency, revision: page.revision,
    }];
  });
}
