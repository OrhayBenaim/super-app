// Pure (no RN imports) so vitest can load it; callers pass t().
import type { SoldBy } from "@grocer/shared/quantity";
import { fmt, shekels } from "@/features/compare/format";
import type { t as translate } from "@/lib/strings";
import type { Measure, Product, ProductGroup } from "./products";

type T = typeof translate;
const num = (n: number) => String(Number(n.toFixed(2)));

/** "500 g", "1.5 kg", "330 ml", "1 L", "12 units". */
export function sizeLabel(measure: Measure, size: number, t: T) {
  if (measure === "unit") return fmt(t("items.size.units"), { n: size });
  const small = size < 1;
  const key = measure === "kg" ? (small ? "items.size.g" : "items.size.kg") : small ? "items.size.ml" : "items.size.l";
  return fmt(t(key), { n: num(small ? size * 1000 : size) });
}

/** The rows that show a quantity pill: the List and My items. */
export type ListScreen = "list" | "items";

/** "×2" for units; "500 g" under a kilo, else "1 kg", "1.5 kg" for weight. */
export const formatQuantity = (q: number, soldBy: SoldBy, t: T) => (soldBy === "unit" ? `×${q}` : sizeLabel("kg", q, t));

/** The List hides a plain ×1 to stay uncluttered; weight always shows; My items always shows it (it holds the + slot). */
export const showPill = (q: number, soldBy: SoldBy, screen: ListScreen) => screen === "items" || soldBy === "weight" || q !== 1;

/** "₪9.90 לק״ג" for weight, "₪6.90" otherwise. */
export const priceLabel = (price: number, soldBy: SoldBy, t: T) => (soldBy === "weight" ? fmt(t("quantity.perKg"), { price: shekels(price) }) : shekels(price));

/** A basket line's "quantity × unit price": "2 × ₪6.90", "1.5 ק״ג × ₪9.90 לק״ג". */
export const lineDetail = (q: number, price: number, soldBy: SoldBy, t: T) =>
  `${soldBy === "unit" ? q : formatQuantity(q, soldBy, t)} × ${priceLabel(price, soldBy, t)}`;

/** A group's name, plus the pack count of a unit group ("ביצים · 12 יח׳"). */
export const groupTitle = (g: ProductGroup, t: T) => (g.measure === "unit" ? `${g.name} · ${sizeLabel("unit", g.size, t)}` : g.name);

/**
 * "by weight" for produce, "63 products", "from ₪6.80 a kilo" (a unit group: its cheapest pack), "in 120 branches".
 * `atStore` (a store-limited search): only that store's price, "₪6.80 a kilo".
 */
export const groupFacts = (g: ProductGroup, t: T, atStore = false) => {
  const price = shekels(g.minPrice);
  const weight = g.soldBy === "weight" ? [t("items.product.byWeight")] : [];
  if (atStore) return [...weight, g.measure === "unit" ? price : fmt(t(g.measure === "kg" ? "items.group.kilo" : "items.group.liter"), { price })];
  return [
    ...weight,
    fmt(t("items.group.products"), { n: g.productCount }),
    fmt(t(g.measure === "kg" ? "items.group.perKg" : g.measure === "l" ? "items.group.perL" : "items.product.from"), { price }),
    fmt(t("items.product.stores"), { n: g.storeCount }),
  ];
};

/**
 * A product row's detail: pack size ("by weight" when sold by weight), manufacturer (when asked), lowest price and branches.
 * `atStore` (a store-limited search): that store's price, no branches.
 */
export const productDetail = (p: Product, t: T, { manufacturer = false, atStore = false } = {}) => {
  const price = priceLabel(p.minPrice, p.soldBy, t);
  return [
    p.soldBy === "weight" ? t("items.product.byWeight") : p.measure && p.size ? sizeLabel(p.measure, p.size, t) : null,
    manufacturer ? p.manufacturer : null,
    atStore ? price : fmt(t("items.product.from"), { price }),
    atStore ? null : fmt(t("items.product.stores"), { n: p.storeCount }),
  ]
    .filter(Boolean)
    .join(" · ");
};
