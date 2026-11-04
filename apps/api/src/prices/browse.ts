// Browse (Home, Promotions): Product group cards worked out per request from the Products with a current price at
// nearby stores, like search (docs/adr/0001). Nothing is stored.
import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import type { Db } from "#/db/index.ts";
import { groupsFrom, nameWords, parseRef, withoutSizes, type Measure } from "#/prices/groups.ts";
import type { SoldBy } from "@grocer/shared/quantity";

/** A Product with a current price at the stores asked about: its cheapest price there and how many of them price it. */
export type Priced = {
  code: string; name: string; unitQty: string | null; isWeighted: number; type: ProductType; minPrice: number; storeCount: number;
};

/** A group card. `minPrice` is per kilo, liter or pack at nearby stores (null without a location); `code` is its commonest Product. */
export type Card = {
  ref: string; name: string; measure: Measure; soldBy: SoldBy; size: number; code: string; minPrice: number | null; storeCount: number;
};

const COLS = `p.code, p.name, p.unit_qty AS unitQty, p.is_weighted AS isWeighted, coalesce(p.product_type, 'other') AS type,
  min(pr.price) AS minPrice, count(*) AS storeCount`;

/**
 * Products with a current price at `storeIds` (at any store when null), optionally of one Product type. An untyped
 * Product counts as Other.
 */
export function pricedProducts(db: Db, storeIds: string[] | null, type?: ProductType): Priced[] {
  const where = [
    ...(storeIds ? ["pr.store_id IN (SELECT value FROM json_each(@stores))"] : []),
    ...(type ? ["coalesce(p.product_type, 'other') = @type"] : []),
  ];
  return db.$client
    .prepare(`SELECT ${COLS} FROM prices pr JOIN products p ON p.code = pr.code ${where.length ? `WHERE ${where.join(" AND ")}` : ""} GROUP BY p.code`)
    .all({ stores: JSON.stringify(storeIds ?? []), type: type ?? null }) as Priced[];
}

/** How many of `storeIds` (of all stores when null) price any of these codes. */
export function storeCountOf(db: Db, codes: string[], storeIds: string[] | null) {
  const { n } = db.$client
    .prepare(
      `SELECT count(DISTINCT store_id) AS n FROM prices WHERE code IN (SELECT value FROM json_each(@codes))
         AND (@all OR store_id IN (SELECT value FROM json_each(@stores)))`,
    )
    .get({ codes: JSON.stringify(codes), stores: JSON.stringify(storeIds ?? []), all: storeIds ? 0 : 1 }) as { n: number };
  return n;
}

/** A Product's first normalized word, unless it is a size ("500 גרם ..."), which never names a group. */
function firstWord(name: string) {
  const words = nameWords(name).map((w) => w.norm);
  const first = withoutSizes(words)[0];
  return first === words[0] ? first : undefined;
}

/**
 * The group cards of these Products without prices or store counts: per Product type, the groups search would make from
 * each Product's first normalized word, one per measure (and pack count), lone Products included.
 */
export function groupsOf(products: Priced[]) {
  const buckets = new Map<string, Priced[]>();
  for (const p of products) {
    const word = firstWord(p.name);
    if (!word) continue;
    const key = `${p.type} ${word}`;
    buckets.set(key, [...(buckets.get(key) ?? []), p]);
  }
  return [...buckets].flatMap(([key, members]) => {
    const [type, word] = key.split(" ") as [ProductType, string];
    return groupsFrom([word], members, { minProducts: 1, everyMeasure: true })
      .filter((g) => parseRef(g.ref)) // a ref the List and Compare accept
      .map((g) => ({ ...g, type }));
  });
}

/** How many group cards each Product type has, in display order (Other last), leaving out types with none. */
export function typeCounts(products: Priced[]) {
  const counts = new Map<ProductType, number>();
  for (const g of groupsOf(products)) counts.set(g.type, (counts.get(g.type) ?? 0) + 1);
  return PRODUCT_TYPES.filter((t) => counts.has(t)).map((type) => ({ type, cardCount: counts.get(type)! }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cards for these Products, most nearby stores first, then by name. Store counts are over `storeIds` (all stores when
 * null, and then no prices are shown: there is no "nearby" to price).
 */
export function cardsOf(db: Db, products: Priced[], storeIds: string[] | null): Card[] {
  const byCode = new Map(products.map((p) => [p.code, p]));
  const cards = groupsOf(products).map(({ ref, name, measure, soldBy, size, minPrice, codes }): Card => ({
    ref, name, measure, soldBy, size,
    code: codes.reduce((a, b) => (byCode.get(b)!.storeCount > byCode.get(a)!.storeCount ? b : a)),
    minPrice: storeIds ? round2(minPrice) : null,
    storeCount: storeCountOf(db, codes, storeIds),
  }));
  return cards.sort((a, b) => b.storeCount - a.storeCount || a.name.localeCompare(b.name, "he"));
}
