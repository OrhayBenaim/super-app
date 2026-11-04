// Browse (Home, Promotions): Product group cards worked out per request from the Products with a current price at
// nearby stores, like search (docs/adr/0001). Nothing is stored.
import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import type { Db } from "#/db/index.ts";
import type { Audience, PromotionKind } from "#/db/appSchema.ts";
import { groupsFrom, measureOf, nameWords, parseRef, soldByOf, withoutSizes, type Measure } from "#/prices/groups.ts";
import { promotionPrice, promotionText, runningPromotions, type RunningPromotion } from "#/prices/promotions.ts";
import type { SoldBy } from "@grocer/shared/quantity";

/** A Product with a current price at the stores asked about: its cheapest price there and how many of them price it. */
export type Priced = {
  code: string; name: string; unitQty: string | null; isWeighted: number; type: ProductType; minPrice: number; storeCount: number;
};

/**
 * A group card. `minPrice` is per kilo, liter or pack at nearby stores (null without a location); `code` is its commonest
 * Product (for the Product image); `codes` are its Products, so the app knows an Item matched to one is on the List.
 */
export type Card = {
  ref: string; name: string; measure: Measure; soldBy: SoldBy; size: number; code: string; minPrice: number | null; storeCount: number;
  codes: string[];
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
  return groupsOf(products).map(toCard(db, products, storeIds)).sort(byStoresThenName);
}

const byStoresThenName = (a: { storeCount: number; name: string }, b: { storeCount: number; name: string }) =>
  b.storeCount - a.storeCount || a.name.localeCompare(b.name, "he");

function toCard(db: Db, products: Priced[], storeIds: string[] | null) {
  const byCode = new Map(products.map((p) => [p.code, p]));
  return ({ ref, name, measure, soldBy, size, minPrice, codes }: ReturnType<typeof groupsOf>[number]): Card => ({
    ref, name, measure, soldBy, size,
    code: codes.reduce((a, b) => (byCode.get(b)!.storeCount > byCode.get(a)!.storeCount ? b : a)),
    minPrice: storeIds ? round2(minPrice) : null,
    storeCount: storeCountOf(db, codes, storeIds),
    codes,
  });
}

/** A Product on a product page: its pack size (null when unreadable) and its cheapest price nearby (null without a location). */
export type GroupProduct = {
  code: string; name: string; measure: Measure | null; size: number | null; soldBy: SoldBy; minPrice: number | null; storeCount: number;
};

/**
 * A group card's product page: the card and its Products, most nearby stores first, then by name. Null when these
 * Products make no such card (not sold nearby, or of another Product type).
 */
export function groupPage(db: Db, products: Priced[], storeIds: string[] | null, ref: string) {
  const group = groupsOf(products).find((g) => g.ref === ref);
  if (!group) return null;
  const members = products.filter((p) => group.codes.includes(p.code)).map(({ code, name, unitQty, isWeighted, minPrice, storeCount }): GroupProduct => ({
    code, name,
    ...(measureOf({ name, unitQty, isWeighted }) ?? { measure: null, size: null }),
    soldBy: soldByOf({ unitQty, isWeighted }),
    minPrice: storeIds ? minPrice : null,
    storeCount,
  }));
  return { card: toCard(db, products, storeIds)(group), products: members.sort(byStoresThenName) };
}

/**
 * A Promotions card: a group card of the Products on a Promotion, headlined by its lowest Promotion price per kilo, liter
 * or pack (`promoPrice`, null when none can be worked out) with that offer's Shelf price, saving in percent, kind,
 * reward (`kind`, `minQty`, `amount`: the app words it), audience (Restricted when not "all") and Hebrew text (an
 * info-only one: the Chain's description). `type` is its Product type; `chainCount` = the Chains running a Promotion on it.
 */
export type PromoCard = Card & {
  type: ProductType; promoPrice: number | null; shelfPrice: number | null; saving: number | null;
  kind: PromotionKind; minQty: number; amount: number; audience: Audience; text: string; chainCount: number;
};

type Offer = { code: string; chainId: string; promo: RunningPromotion; shelf: number; off: ReturnType<typeof promotionPrice> };

/**
 * Cards of the Products with a Promotion running at `now` (#118's timing; every stored audience counts) at `storeIds`,
 * optionally of one Product type or at one Chain's stores. Biggest saving first, those with no price last.
 */
export function promotionCards(db: Db, storeIds: string[], now: Date, { type, chain }: { type?: ProductType; chain?: string } = {}): PromoCard[] {
  const chainOf = new Map(
    (db.$client.prepare("SELECT id, chain_id AS chainId FROM stores WHERE id IN (SELECT value FROM json_each(?))").all(JSON.stringify(storeIds)) as { id: string; chainId: string }[])
      .filter((s) => !chain || s.chainId === chain)
      .map((s) => [s.id, s.chainId]),
  );
  const stores = [...chainOf.keys()];
  const priced = pricedProducts(db, stores, type);
  const running = runningPromotions(db, stores, priced.map((p) => p.code), now);
  const shelves = db.$client
    .prepare("SELECT store_id AS storeId, code, price FROM prices WHERE store_id IN (SELECT value FROM json_each(?)) AND code IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify(stores), JSON.stringify([...new Set([...running.values()].flat().map((r) => r.code))])) as { storeId: string; code: string; price: number }[];
  const offers = new Map<string, Offer[]>(); // by code
  for (const s of shelves)
    for (const promo of running.get(`${s.storeId} ${s.code}`) ?? [])
      offers.set(s.code, [...(offers.get(s.code) ?? []), { code: s.code, chainId: chainOf.get(s.storeId)!, promo, shelf: s.price, off: promotionPrice(promo, s.price) }]);
  const byCode = new Map(priced.map((p) => [p.code, p]));
  const cards = cardsOf(db, priced.filter((p) => offers.has(p.code)), stores).map((card): PromoCard => {
    const perUnit = (code: string) => (card.measure === "unit" ? 1 : measureOf(byCode.get(code)!)!.size);
    const mine = card.codes.flatMap((code) => offers.get(code)!).map((o) => ({ ...o, each: o.off ? o.off.price / perUnit(o.code) : null }));
    // The lowest price, then the bigger saving, then the one for everyone.
    const [best] = mine.sort(
      (a, b) => (a.each ?? Infinity) - (b.each ?? Infinity) || (b.off?.saving ?? 0) - (a.off?.saving ?? 0) || +(a.promo.audience !== "all") - +(b.promo.audience !== "all"),
    ) as [(typeof mine)[number]];
    return {
      ...card,
      type: byCode.get(card.code)!.type, // a group's Products share a type
      promoPrice: best.each === null ? null : round2(best.each),
      shelfPrice: best.each === null ? null : round2(best.shelf / perUnit(best.code)),
      saving: best.off?.saving ?? null,
      kind: best.promo.kind,
      minQty: best.promo.minQty,
      amount: best.promo.amount,
      audience: best.promo.audience,
      text: promotionText(best.promo, best.shelf),
      chainCount: new Set(mine.map((o) => o.chainId)).size,
    };
  });
  return cards.sort((a, b) => (b.saving ?? -1) - (a.saving ?? -1));
}
