// Pure (no RN imports) so vitest can load it; callers pass t().
import type { SoldBy } from "@grocer/shared/quantity";
import { formatQuantity } from "@/features/items/labels";
import type { t as translate } from "@/lib/strings";
import { fmt, shekels } from "./format";
import type { Promotion } from "./sort";

/** A Promotion's reward in the app's language, built from its fields: "3 for ₪10", "20% off", "Sale price" (its price is in the price column). */
export function promotionText(p: Promotion, soldBy: SoldBy, t: typeof translate) {
  if (p.kind === "bundle") return fmt(t("compare.promo.nFor"), { qty: soldBy === "unit" ? p.minQty : formatQuantity(p.minQty, soldBy, t), price: shekels(p.amount) });
  if (p.kind === "percent") return fmt(t("compare.promo.percentOff"), { n: p.amount });
  return soldBy === "weight" ? fmt(t("quantity.perKg"), { price: shekels(p.amount) }) : t("compare.promo.salePrice");
}
