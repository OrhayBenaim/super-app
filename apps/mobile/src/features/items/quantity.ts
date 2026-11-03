// Pure (no RN imports) so vitest can load it; callers pass t().
import type { SoldBy } from "@grocer/shared/quantity";
import { fmt, shekels } from "@/features/compare/format";
import type { t as translate } from "@/lib/strings";

type T = typeof translate;
const num = (n: number) => String(Number(n.toFixed(2)));

/** "×2" for units; "500 g" under a kilo, else "1 kg", "1.5 kg" for weight. */
export const formatQuantity = (q: number, soldBy: SoldBy, t: T) =>
  soldBy === "unit" ? `×${q}` : q < 1 ? fmt(t("items.size.g"), { n: num(q * 1000) }) : fmt(t("items.size.kg"), { n: num(q) });

/** The List hides a plain ×1 to stay uncluttered; weight always shows; My items always shows it (it holds the + slot). */
export const showPill = (q: number, soldBy: SoldBy, screen: "list" | "items") => screen === "items" || soldBy === "weight" || q !== 1;

/** "₪9.90 לק״ג" for weight, "₪6.90" otherwise. */
export const priceLabel = (price: number, soldBy: SoldBy, t: T) => (soldBy === "weight" ? fmt(t("quantity.perKg"), { price: shekels(price) }) : shekels(price));

/** A basket line's "amount × unit price": "2 × ₪6.90", "1.5 ק״ג × ₪9.90 לק״ג". */
export const lineDetail = (q: number, price: number, soldBy: SoldBy, t: T) =>
  `${soldBy === "unit" ? q : formatQuantity(q, soldBy, t)} × ${priceLabel(price, soldBy, t)}`;
