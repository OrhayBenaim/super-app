// Browse (Home, Promotions): Product group cards worked out per request from the Products with a current price at
// nearby stores, like search (docs/adr/0001). Nothing is stored; prices come from the in-memory price index.
import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import type { Audience, PromotionKind } from "#/db/appSchema.ts";
import { byName, groupsFrom, measureOf, nameWords, parseRef, soldByOf, withoutSizes, type Measure } from "#/prices/groups.ts";
import type { PriceIndex, Product, StorePromotion } from "#/prices/price-index.ts";
import { promotionPrice, promotionText, round2, runningAt, savingOf, unitPrice } from "#/prices/promotions.ts";
import type { SoldBy } from "@grocer/shared/quantity";

/** A Product with a current price at the stores asked about: its cheapest price there and how many of them price it. */
export type Priced = {
  code: string; name: string; unitQty: string | null; isWeighted: number; type: ProductType; minPrice: number; storeCount: number;
};

/**
 * A group card (`ref` null for a lone Product with no group ref: it is matched by `code`). `minPrice` is per kilo, liter or pack at nearby stores (null without a location); `code` is its commonest
 * Product (for the Product image); `codes` are its Products, so the app knows an Item matched to one is on the List.
 */
export type Card = {
  ref: string | null; name: string; measure: Measure; soldBy: SoldBy; size: number; code: string; minPrice: number | null; storeCount: number;
  codes: string[];
};

/**
 * Products with a current price at `storeIds` (at any store when null), in code order, optionally of one Product type.
 * An untyped Product counts as Other.
 */
export function pricedProducts(index: PriceIndex, storeIds: string[] | null, type?: ProductType): Priced[] {
  const min = new Float64Array(index.products.length).fill(Infinity);
  const count = new Uint32Array(index.products.length);
  for (const id of storeIds ?? index.storeIds) {
    const { products, prices } = index.prices(id);
    for (let i = 0; i < products.length; i++) {
      const p = products[i]!;
      count[p]!++;
      if (prices[i]! < min[p]!) min[p] = prices[i]!;
    }
  }
  return index.products.flatMap((p, i) => (count[i] && (!type || p.type === type) ? [{ ...p, minPrice: min[i]!, storeCount: count[i]! }] : []));
}

/** Per card, how many of `storeIds` (of all stores when null) price any of its codes. A code is on one card at most. */
function storeCounts(index: PriceIndex, cards: { codes: string[] }[], storeIds: string[] | null) {
  const cardOf = new Int32Array(index.products.length).fill(-1);
  cards.forEach((card, c) => card.codes.forEach((code) => (cardOf[index.byCode.get(code)!] = c)));
  const counts = new Uint32Array(cards.length);
  const lastStore = new Int32Array(cards.length).fill(-1);
  (storeIds ?? index.storeIds).forEach((id, s) => {
    for (const p of index.prices(id).products) {
      const c = cardOf[p]!;
      if (c >= 0 && lastStore[c] !== s) {
        lastStore[c] = s;
        counts[c]!++;
      }
    }
  });
  return counts;
}

/** A Product's first normalized word, unless it is a size ("500 גרם ..."), which never names a group. */
const firstWord = byName((name) => {
  const words = nameWords(name).map((w) => w.norm);
  const first = withoutSizes(words)[0];
  return first !== undefined && first === words[0] ? [first] : [];
});

const ownWords = byName((name) => withoutSizes(nameWords(name).map((w) => w.norm)));

type Group = Omit<ReturnType<typeof groupsFrom>[number], "ref" | "refinements"> & { ref: string | null; type: ProductType };

// A bucket's groups depend only on its Products, prices aside, and nearby locations share most buckets: they are kept
// per price index, by `wordsOf` and the bucket's codes, and only their minPrice is worked out again.
// shortcut: a full memo is emptied; raise MAX_BUCKETS if a busy API keeps refilling it.
const MAX_BUCKETS = 300_000;
const bucketMemos = new WeakMap<PriceIndex, Map<(name: string) => string[], Map<string, Group[]>>>();

/** The lowest price of a group's Products, per kilo or liter, or per pack, as groupsFrom works it out. */
function lowestPrice(group: Group, byCode: Map<string, Priced>) {
  let min = Infinity;
  for (const code of group.codes) {
    const p = byCode.get(code)!;
    min = Math.min(min, group.measure === "unit" ? p.minPrice : p.minPrice / measureOf(p)!.size);
  }
  return min;
}

/** Per Product type, the groups `wordsOf` each Product's name makes, one per measure (and pack count), lone Products included. */
function groupsBy(index: PriceIndex, products: Priced[], wordsOf: (name: string) => string[]): Group[] {
  const memos = bucketMemos.get(index) ?? bucketMemos.set(index, new Map()).get(index)!;
  const memo = memos.get(wordsOf) ?? memos.set(wordsOf, new Map()).get(wordsOf)!;
  type Bucket = { type: ProductType; words: string[]; members: Priced[] };
  const buckets: Bucket[] = []; // in the order first seen
  const byWords = new Map<ProductType, Map<string, Bucket>>();
  for (const p of products) {
    const words = wordsOf(p.name);
    if (!words.length) continue;
    const key = words.length === 1 ? words[0]! : words.join(" ");
    const mine = byWords.get(p.type) ?? byWords.set(p.type, new Map()).get(p.type)!;
    let bucket = mine.get(key);
    if (!bucket) {
      bucket = { type: p.type, words, members: [] };
      buckets.push(bucket);
      mine.set(key, bucket);
    }
    bucket.members.push(p);
  }
  return buckets.flatMap(({ type, words, members }) => {
    const key = members.length === 1 ? members[0]!.code : members.map((p) => p.code).join("\0");
    let groups = memo.get(key);
    if (!groups) {
      groups = groupsFrom(words, members, BROWSE)
        .map((g) => narrowed(g, words, members))
        .filter((g) => parseRef(g.ref)) // a ref the List and Compare accept
        .map(({ refinements, ...g }) => ({ ...g, ref: g.ref as string | null, type }));
      if (memo.size >= MAX_BUCKETS) memo.clear();
      memo.set(key, groups);
    }
    const byCode = new Map(members.map((p) => [p.code, p]));
    return groups.map((g) => ({ ...g, minPrice: lowestPrice(g, byCode) }));
  });
}

const BROWSE = { minProducts: 1, everyMeasure: true };

/** A name's normalized words before its first number or size ("דיאט קולה 1.5 ליטר סופר" -> דיאט קולה). */
const leadWords = byName((name) => {
  const words = nameWords(name).map((w) => w.norm);
  const kept = withoutSizes(words);
  const end = words.findIndex((w, i) => /^\d/.test(w) || w !== kept[i]);
  return end < 0 ? words : words.slice(0, end);
});

/**
 * The group named by every lead word its Products share ("דיאט קוקה קולה", not just "דיאט"), so a card says what it
 * holds and Compare prices only those; the group itself when they share no more than `words`.
 */
function narrowed<G extends ReturnType<typeof groupsFrom>[number]>(group: G, words: string[], members: Priced[]) {
  const codes = new Set(group.codes);
  const mine = members.filter((p) => codes.has(p.code));
  const [first = [], ...rest] = mine.map((p) => leadWords(p.name));
  const n = rest.reduce((n, w) => {
    let i = 0;
    while (i < n && w[i] === first[i]) i++;
    return i;
  }, first.length);
  if (n <= words.length) return group;
  return groupsFrom(first.slice(0, n), mine, BROWSE)[0] ?? group;
}

/** The group a ref names among these Products of one Product type, or undefined. */
function refGroup(products: Priced[], ref: string) {
  const parsed = parseRef(ref);
  const group = parsed && groupsFrom(parsed.words, products, BROWSE).find((g) => g.ref === ref);
  return group ? { ...group, ref: group.ref as string | null, type: products[0]!.type } : undefined;
}

/** A card for one Product with no group ref: Add matches its code. Priced per kilo, liter or pack; a pack of one without a size. */
function loneCard(p: Priced): Group {
  const { measure, size } = measureOf(p) ?? { measure: "unit" as const, size: 1 };
  const minPrice = measure === "unit" ? p.minPrice : p.minPrice / size;
  return { ref: null, name: p.name, measure, soldBy: soldByOf(p), size, minPrice, codes: [p.code], type: p.type };
}

/**
 * The group cards of these Products without prices or store counts, each Product on exactly one: per Product type, the
 * groups search would make from each Product's first normalized word (every measure, lone Products included). A Product
 * none holds (a qualifier such as סויה, its size first, no readable size) gets its own: the group its own words make,
 * or else a card with no group ref.
 */
function groupsOf(index: PriceIndex, products: Priced[]) {
  const grouped = groupsBy(index, products, firstWord);
  const held = new Set(grouped.flatMap((g) => g.codes));
  const refs = new Set(grouped.map((g) => `${g.type}|${g.ref}`));
  const own = groupsBy(index, products.filter((p) => !held.has(p.code)), ownWords).filter((g) => !refs.has(`${g.type}|${g.ref}`));
  for (const code of own.flatMap((g) => g.codes)) held.add(code);
  return [...grouped, ...own, ...products.filter((p) => !held.has(p.code)).map(loneCard)];
}

/** How many group cards each Product type has, in display order (Other last), leaving out types with none. */
export function typeCounts(index: PriceIndex, products: Priced[]) {
  const counts = new Map<ProductType, number>();
  for (const g of groupsOf(index, products)) counts.set(g.type, (counts.get(g.type) ?? 0) + 1);
  return PRODUCT_TYPES.filter((t) => counts.has(t)).map((type) => ({ type, cardCount: counts.get(type)! }));
}

/**
 * Cards for these Products, most nearby stores first, then by name. Store counts are over `storeIds` (all stores when
 * null, and then no prices are shown: there is no "nearby" to price).
 */
export function cardsOf(index: PriceIndex, products: Priced[], storeIds: string[] | null): Card[] {
  return toCards(index, products, groupsOf(index, products), storeIds).sort(byStoresThenName);
}

const hebrew = new Intl.Collator("he"); // localeCompare(b, "he") without a new collator per call
const byStoresThenName = (a: { storeCount: number; name: string }, b: { storeCount: number; name: string }) =>
  b.storeCount - a.storeCount || hebrew.compare(a.name, b.name);

function toCards(index: PriceIndex, products: Priced[], groups: ReturnType<typeof groupsOf>, storeIds: string[] | null) {
  const byCode = new Map(products.map((p) => [p.code, p]));
  const counts = storeCounts(index, groups, storeIds);
  return groups.map(({ ref, name, measure, soldBy, size, minPrice, codes }, i): Card => ({
    ref, name, measure, soldBy, size,
    code: codes.reduce((a, b) => (byCode.get(b)!.storeCount > byCode.get(a)!.storeCount ? b : a)),
    minPrice: storeIds ? round2(minPrice) : null,
    storeCount: counts[i]!,
    codes,
  }));
}

/** A Product on a product page: its pack size (null when unreadable) and its cheapest price nearby (null without a location). */
export type GroupProduct = {
  code: string; name: string; measure: Measure | null; size: number | null; soldBy: SoldBy; minPrice: number | null; storeCount: number;
};

/**
 * A group card's product page: the card and its Products, most nearby stores first, then by name. Null when these
 * Products make no such card (not sold nearby, or of another Product type).
 */
export function groupPage(index: PriceIndex, products: Priced[], storeIds: string[] | null, ref: string) {
  // A card's group narrows to the words its Products share, so a page over more Products (all Chains, not the one a
  // Promotions card was filtered to) may name the group otherwise: then its ref's own Products make it.
  const group = groupsOf(index, products).find((g) => g.ref === ref) ?? refGroup(products, ref);
  if (!group) return null;
  const codes = new Set(group.codes);
  const members = products.filter((p) => codes.has(p.code)).map(({ code, name, unitQty, isWeighted, minPrice, storeCount }): GroupProduct => ({
    code, name,
    ...(measureOf({ name, unitQty, isWeighted }) ?? { measure: null, size: null }),
    soldBy: soldByOf({ unitQty, isWeighted }),
    minPrice: storeIds ? minPrice : null,
    storeCount,
  }));
  return { card: toCards(index, products, [group], storeIds)[0]!, products: members.sort(byStoresThenName) };
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

type Offer = { product: Product; chainId: string; promo: StorePromotion; shelf: number; off: ReturnType<typeof promotionPrice> };
type Ranked = Offer & { each: number | null };
/** The lowest price, then the bigger saving, then the one for everyone. */
const byBestOffer = (a: Ranked, b: Ranked) =>
  (a.each ?? Infinity) - (b.each ?? Infinity) || (b.off?.saving ?? 0) - (a.off?.saving ?? 0) || +(a.promo.audience !== "all") - +(b.promo.audience !== "all");

/** An offer's Promotion text as Compare words it (by the kilo when the Product is weighed). */
const offerText = ({ product, promo, shelf }: Offer) => promotionText({ ...promo, weighted: product.isWeighted ? 1 : 0 }, shelf);

/**
 * Calls `visit` with every offer at `stores` running at `now` (#118's timing; every stored audience counts): one per
 * store, Promotion and Product it covers (by index) that the store prices at `shelf`, of `type` when given. One Chain's
 * stores come one after another.
 */
function forEachOffer(
  index: PriceIndex, stores: string[], now: Date, type: ProductType | undefined,
  visit: (p: number, chainId: string, promo: StorePromotion, shelf: number) => void,
) {
  const running = runningAt(now);
  const shelf = new Float64Array(index.products.length).fill(NaN); // the store's Shelf prices, by Product
  const byChain = stores.map((id) => ({ id, chainId: index.chainOf(id) })).sort((a, b) => (a.chainId < b.chainId ? -1 : a.chainId > b.chainId ? 1 : 0));
  for (const { id, chainId } of byChain) {
    const promos = index.promotions(id).filter(running);
    if (!promos.length) continue;
    const { products, prices } = index.prices(id);
    for (let i = 0; i < products.length; i++) shelf[products[i]!] = prices[i]!;
    for (const promo of promos)
      for (const p of promo.products) if (!Number.isNaN(shelf[p]) && (!type || index.products[p]!.type === type)) visit(p, chainId, promo, shelf[p]!);
    for (const p of products) shelf[p] = NaN;
  }
}

/** byBestOffer(offerOf(promo, shelf), b) < 0, without making the offer: most of a city's ~2M offers lose. */
function beats(promo: StorePromotion, shelf: number, b: Ranked) {
  const unit = unitPrice(promo, shelf);
  const each = unit === null ? Infinity : round2(unit);
  if (each !== (b.each ?? Infinity)) return each < (b.each ?? Infinity);
  const saving = unit === null ? 0 : savingOf(unit, shelf);
  if (saving !== (b.off?.saving ?? 0)) return saving > (b.off?.saving ?? 0);
  return promo.audience === "all" && b.promo.audience !== "all";
}

/** One offer, ranked by its own price (`each`). */
function offerOf(index: PriceIndex, p: number, chainId: string, promo: StorePromotion, shelf: number): Ranked {
  const off = promotionPrice(promo, shelf);
  return { product: index.products[p]!, chainId, promo, shelf, off, each: off?.price ?? null };
}

/**
 * The Products priced at `storeIds` (optionally of one Product type, at one Chain's stores) with a Promotion running at
 * `now`, and per Product (by index) its best offer and the Chains running one on it.
 */
function promotionOffers(index: PriceIndex, storeIds: string[], now: Date, { type, chain }: { type?: ProductType; chain?: string }) {
  const stores = chain ? storeIds.filter((s) => index.chainOf(s) === chain) : storeIds;
  const best = new Array<Ranked | undefined>(index.products.length);
  const chains = new Array<Set<string> | undefined>(index.products.length);
  const lastChain = new Array<string | undefined>(index.products.length);
  forEachOffer(index, stores, now, type, (p, chainId, promo, shelf) => {
    if (lastChain[p] !== chainId) {
      lastChain[p] = chainId; // a Chain's stores come one after another, so each Chain is added once
      (chains[p] ??= new Set()).add(chainId);
    }
    const b = best[p];
    if (!b || beats(promo, shelf, b)) best[p] = offerOf(index, p, chainId, promo, shelf);
  });
  return { stores, pool: pricedProducts(index, stores, type).filter((p) => best[index.byCode.get(p.code)!]), best, chains };
}

/**
 * Cards of the Products with a Promotion running at `now` at `storeIds`, optionally of one Product type or at one
 * Chain's stores. Biggest saving first, those with no price last.
 */
export const promotionCards = (index: PriceIndex, storeIds: string[], now: Date, filters: { type?: ProductType; chain?: string } = {}) =>
  promoCardsOf(index, promotionOffers(index, storeIds, now, filters));

function promoCardsOf(index: PriceIndex, { stores, pool, best, chains }: ReturnType<typeof promotionOffers>): PromoCard[] {
  const cards = cardsOf(index, pool, stores).map((card): PromoCard => {
    const perUnit = (p: Product) => (card.measure === "unit" ? 1 : measureOf(p)!.size);
    const members = card.codes.map((code) => index.byCode.get(code)!);
    const [top] = members.map((p) => best[p]!).map((o) => ({ ...o, each: o.off ? o.off.price / perUnit(o.product) : null })).sort(byBestOffer) as [Ranked];
    return {
      ...card,
      type: top.product.type, // a group's Products share a type
      promoPrice: top.each === null ? null : round2(top.each),
      shelfPrice: top.each === null ? null : round2(top.shelf / perUnit(top.product)),
      saving: top.off?.saving ?? null,
      kind: top.promo.kind,
      minQty: top.promo.minQty,
      amount: top.promo.amount,
      audience: top.promo.audience,
      text: offerText(top),
      chainCount: new Set(members.flatMap((p) => [...chains[p]!])).size,
    };
  });
  return cards.sort((a, b) => (b.saving ?? -1) - (a.saving ?? -1));
}

/**
 * One of a Chain's Promotions on a Product: its best offer at the Chain's nearby stores, priced per unit (per kilo when
 * weighed) next to that store's Shelf price; both null (and saving) when there is no price we can work out.
 */
export type ChainPromo = {
  chainId: string; promoPrice: number | null; shelfPrice: number | null; saving: number | null;
  kind: PromotionKind; minQty: number; amount: number; audience: Audience; text: string;
};

/**
 * A Promotions card's product page: the card and only its Products on a Promotion running now, each broken down by
 * Chain (lowest price first, no-price last) into every Promotion it runs, each with its own audience. Null when no such card is on a Promotion at `storeIds`.
 */
export function promotionPage(index: PriceIndex, storeIds: string[], now: Date, type: ProductType, ref: string) {
  const promoted = promotionOffers(index, storeIds, now, { type });
  const page = groupPage(index, promoted.pool, promoted.stores, ref);
  if (!page) return null;
  const codes = new Set(page.card.codes);
  // Grouping only the group's Products gives back that one card, without the whole Promotions list.
  const [card] = promoCardsOf(index, { ...promoted, pool: promoted.pool.filter((p) => codes.has(p.code)) }) as [PromoCard];
  const lines = new Map<string, Map<string, Ranked>>(); // per code, per Chain and Promotion: its lowest price at the Chain's nearby stores
  forEachOffer(index, promoted.stores, now, type, (p, chainId, promo, shelf) => {
    if (!codes.has(index.products[p]!.code)) return;
    const o = offerOf(index, p, chainId, promo, shelf);
    const mine = lines.get(o.product.code) ?? lines.set(o.product.code, new Map()).get(o.product.code)!;
    const key = `${o.chainId} ${o.promo.id}`;
    const b = mine.get(key);
    if (!b || byBestOffer(o, b) < 0) mine.set(key, o);
  });
  const chains = (code: string) => {
    const ranked = [...lines.get(code)!.values()].sort(byBestOffer);
    return [...new Set(ranked.map((o) => o.chainId))].flatMap((id) => ranked.filter((o) => o.chainId === id)).map((o): ChainPromo => ({
      chainId: o.chainId,
      promoPrice: o.off?.price ?? null,
      shelfPrice: o.off ? o.shelf : null,
      saving: o.off?.saving ?? null,
      kind: o.promo.kind, minQty: o.promo.minQty, amount: o.promo.amount, audience: o.promo.audience,
      text: o.off ? offerText(o) : o.promo.description, // no price: the Chain's own words
    }));
  };
  return { card, products: page.products.map((p) => ({ ...p, chains: chains(p.code) })) };
}
