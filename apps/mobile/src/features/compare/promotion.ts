// Pure (no RN imports) so vitest can load it; callers pass t().
import type { SoldBy } from "@grocer/shared/quantity";
import { formatQuantity } from "@/features/items/labels";
import type { t as translate } from "@/lib/strings";
import { fmt, shekels } from "./format";
import type { BasketDeal, Promotion, StoreResult } from "./sort";

type Line = StoreResult["items"][number];

/** A Promotion's reward in the app's language, built from its fields: "3 for ₪10", "20% off", "2+1", "Sale price" (its price is in the price column). */
export function promotionText(p: Promotion, soldBy: SoldBy, t: typeof translate) {
  const qty = soldBy === "unit" ? p.minQty : formatQuantity(p.minQty, soldBy, t);
  if (p.kind === "bundle") return fmt(t("compare.promo.nFor"), { qty, price: shekels(p.amount) });
  if (p.kind === "percent") return fmt(t("compare.promo.percentOff"), { n: p.amount });
  if (p.kind === "nth") return p.amount === 100 ? fmt(t("compare.promo.buyGet"), { n: p.minQty - 1, m: 1 }) : fmt(t("compare.promo.nthOff"), { n: p.minQty, pct: p.amount });
  if (p.kind === "off") return fmt(t(p.minQty > 1 ? "compare.promo.amountOffFor" : "compare.promo.amountOff"), { amount: shekels(p.amount), qty });
  return soldBy === "weight" ? fmt(t("quantity.perKg"), { price: shekels(p.amount) }) : t("compare.promo.salePrice");
}

/** A spend deal's row above the total: "₪8.90 when you spend ₪75.00" (a price is shown as is: the row has no price column for it). */
export const basketText = (deal: BasketDeal, soldBy: SoldBy, t: typeof translate) =>
  fmt(t("compare.promo.basket"), {
    promo: deal.kind === "price" && soldBy !== "weight" ? shekels(deal.amount) : promotionText(deal, soldBy, t),
    min: shekels(deal.minPurchase),
  });

export const audienceKey = { club: "compare.promo.club", card: "compare.promo.card", coupon: "compare.promo.coupon" } as const;
const audienceLabel = (p: Promotion, t: typeof translate) => (p.audience === "all" ? undefined : t(audienceKey[p.audience]));

/**
 * The Promotion rows under a breakdown line, in order: the applied one ("3 for ₪10", label: its audience and the other
 * lines sharing it), one per Promotion its Quantity doesn't reach, then one per information-only one (the Chain's description).
 */
export function promotionRows(
  line: Pick<Line, "promotion" | "hints" | "info"> & { partners?: string[] },
  soldBy: SoldBy,
  t: typeof translate,
): { kind: "applied" | "hint" | "info"; text: string; label?: string }[] {
  const { promotion: p, hints = [], info = [], partners } = line;
  const applied = p && {
    kind: "applied" as const,
    text: promotionText(p, soldBy, t),
    label: [audienceLabel(p, t), partners?.length ? fmt(t("compare.promo.with"), { names: partners.join(", ") }) : undefined].filter(Boolean).join(" · ") || undefined,
  };
  return [
    ...(applied ? [applied] : []),
    ...hints.map((h) => ({ kind: "hint" as const, text: fmt(t("compare.promo.available"), { promo: promotionText(h, soldBy, t) }), label: audienceLabel(h, t) })),
    ...info.map((i) => ({ kind: "info" as const, text: i.description })),
  ];
}
