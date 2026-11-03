// Pure (no RN imports) so vitest can load it; callers pass t().
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

/** A group's name, plus the pack count of a unit group ("ביצים · 12 יח׳"). */
export const groupTitle = (g: ProductGroup, t: T) => (g.measure === "unit" ? `${g.name} · ${sizeLabel("unit", g.size, t)}` : g.name);

/** "63 products", "from ₪6.80 a kilo" (a unit group: its cheapest pack), "in 120 branches". */
export const groupFacts = (g: ProductGroup, t: T) => [
  fmt(t("items.group.products"), { n: g.productCount }),
  fmt(t(g.measure === "kg" ? "items.group.perKg" : g.measure === "l" ? "items.group.perL" : "items.product.from"), { price: shekels(g.minPrice) }),
  fmt(t("items.product.stores"), { n: g.storeCount }),
];

/** A product row's detail: pack size, manufacturer (when asked), lowest price and branches. */
export const productDetail = (p: Product, t: T, manufacturer = false) =>
  [
    p.measure && p.size ? sizeLabel(p.measure, p.size, t) : null,
    manufacturer ? p.manufacturer : null,
    fmt(t("items.product.from"), { price: shekels(p.minPrice) }),
    fmt(t("items.product.stores"), { n: p.storeCount }),
  ]
    .filter(Boolean)
    .join(" · ");
