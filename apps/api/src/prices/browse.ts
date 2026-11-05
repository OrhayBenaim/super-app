// Browse (Home, Promotions): the group cards with Products priced at nearby stores, read from browse's copy of the price
// data (browse-data.ts): the nearby stores' packed prices and Promotions, and every Product's group card as the last
// Price sync stored it (browse-groups.ts, the rules of docs/adr/0001). A request adds them up in a loop.
import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import type { SoldBy } from "@grocer/shared/quantity";
import type { Audience, PromotionKind } from "#/db/appSchema.ts";
import type { Db } from "#/db/index.ts";
import { catalog, nameOf, promotionStrings, runningPromotionsOf, storeData, type Catalog, type StoreData, type StorePromotion } from "#/prices/browse-data.ts";
import { BROWSE } from "#/prices/browse-groups.ts";
import {
  commonest, editedMembers, groupEdits, groupRef, groupSoldBy, groupsFrom, madeGroups, madeId, measureOf, parseRef, soldByOf, type Measure,
} from "#/prices/groups.ts";
import { promotionPrice, promotionText, round2, savingOf, unitPrice } from "#/prices/promotions.ts";

/**
 * A group card (`ref` null for a lone Product with no group ref: it is matched by `code`). `minPrice` is per kilo, liter or pack at nearby stores (null without a location); `code` is its commonest
 * Product (for the Product image); `codes` are its Products, so the app knows an Item matched to one is on the List.
 */
export type Card = {
  ref: string | null; name: string; measure: Measure; soldBy: SoldBy; size: number; code: string; minPrice: number | null; storeCount: number;
  codes: string[];
};

/**
 * Per Product (browse_products id): its cheapest price at the stores asked about and how many of them price it. Without
 * a location every store counts and nothing is priced (there is no "nearby" to price).
 */
type Near = { db: Db; cat: Catalog; stores: StoreData[] | null; min: Float64Array | null; count: Int32Array };

/** `storeIds`' prices (optionally one Chain's stores, and with `offers` their Promotions), or every store's counts when null. */
function near(db: Db, storeIds: string[] | null, { chain, offers = false }: { chain?: string; offers?: boolean } = {}): Near {
  const cat = catalog(db);
  if (!storeIds) return { db, cat, stores: null, min: null, count: cat.stores };
  const stores = storeData(db, storeIds, offers).filter((s) => !chain || s.chainId === chain);
  const n = cat.groups.length; // a Product numbered since the last grouping has no card yet
  const min = new Float64Array(n).fill(Infinity);
  const count = new Int32Array(n);
  for (const { products, prices } of stores)
    for (let i = 0; i < products.length; i++) {
      const k = products[i]!;
      if (k >= n) continue;
      count[k]!++;
      if (prices[i]! < min[k]!) min[k] = prices[i]!;
    }
  return { db, cat, stores, min, count };
}

/** How many group cards each Product type has nearby, in display order (Other last), leaving out types with none. */
export function typeCounts(db: Db, storeIds: string[] | null) {
  const { cat, count } = near(db, storeIds);
  const counted = new Uint8Array(cat.groupTypes.length);
  const counts = new Uint32Array(PRODUCT_TYPES.length);
  for (let k = 0; k < count.length; k++) {
    const g = cat.groups[k]!;
    if (count[k] && g >= 0 && !counted[g]) {
      counted[g] = 1;
      counts[cat.groupTypes[g]!]!++;
    }
  }
  return PRODUCT_TYPES.flatMap((type, t) => (counts[t] ? [{ type, cardCount: counts[t] }] : []));
}

type Meta = { ref: string | null; name: string; measure: Measure; size: number; soldBy: SoldBy };
type Built = Card & { group: number; members: number[]; lead: { lead: string; leadRaw: string }[] };

const hebrew = new Intl.Collator("he"); // localeCompare(b, "he") without a new collator per call
const byStoresThenName = (a: { storeCount: number; name: string }, b: { storeCount: number; name: string }) =>
  b.storeCount - a.storeCount || hebrew.compare(a.name, b.name);
const typeIndex = (type: ProductType) => PRODUCT_TYPES.indexOf(type);

/**
 * Cards of these groups' Products (browse_products ids) priced nearby: a card's store count is the nearby stores pricing
 * any of them (without a location, the stores pricing any of its group's), `code` the one most of them price.
 */
function build(nr: Near, cards: { group: number; meta: Meta; members: number[] }[]): Built[] {
  const { cat, count, min, stores } = nr;
  const storeCount = new Int32Array(cards.length);
  if (stores) {
    const cardOf = new Int32Array(count.length).fill(-1);
    cards.forEach((c, i) => c.members.forEach((k) => (cardOf[k] = i)));
    const lastStore = new Int32Array(cards.length).fill(-1);
    stores.forEach(({ products }, s) => {
      for (const k of products) {
        const c = k < cardOf.length ? cardOf[k]! : -1;
        if (c >= 0 && lastStore[c] !== s) {
          lastStore[c] = s;
          storeCount[c]!++;
        }
      }
    });
  } else cards.forEach((c, i) => (storeCount[i] = cat.groupStores[c.group]!));
  const codeOf = new Map(cards.flatMap((c) => c.members).map((k) => [k, nameOf(cat, k)]));
  return cards.map(({ group, meta, members }, i): Built => {
    const ks = members.sort((a, b) => (codeOf.get(a)!.code < codeOf.get(b)!.code ? -1 : 1)); // code order, as ties fall
    let price = Infinity;
    if (min) for (const k of ks) price = Math.min(price, min[k]! / cat.perUnit[k]!);
    return {
      ...meta,
      code: codeOf.get(ks.reduce((a, b) => (count[b]! > count[a]! ? b : a)))!.code,
      minPrice: min ? round2(price) : null,
      storeCount: storeCount[i]!,
      codes: ks.map((k) => codeOf.get(k)!.code),
      group,
      members: ks,
      lead: ks.map((k) => codeOf.get(k)!),
    };
  });
}

/** Name rows of these Products, with their cheapest nearby price (0 without a location), as groupsFrom takes them. */
const candidates = ({ db, min }: Near, ids: number[]) =>
  (db.$client
    .prepare("SELECT b.id, p.code, p.name, p.unit_qty AS unitQty, p.is_weighted AS isWeighted FROM browse_products b JOIN products p ON p.code = b.code WHERE b.id IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify(ids)) as { id: number; code: string; name: string; unitQty: string | null; isWeighted: number }[]).map((p) => ({ ...p, minPrice: min ? min[p.id]! : 0 }));

/**
 * Narrows each card that holds only some of its group's Products to the lead words those share, as the Price sync
 * narrowed the group over all of them (browse-groups.ts): a Promotions card of Tnuva's milk only is "חלב תנובה".
 */
function narrowHere(nr: Near, cards: Built[]) {
  const { cat } = nr;
  const groupSize = new Int32Array(cat.groupTypes.length);
  for (let k = 0; k < cat.groups.length; k++) if (cat.groups[k]! >= 0 && cat.stores[k]) groupSize[cat.groups[k]!]!++;
  const edited = groupEdits(nr.db); // an edited or Made group keeps its ref, so its edits stay with it
  const partial = cards.filter((c) => c.ref !== null && !edited.has(c.ref) && c.members.length < groupSize[c.group]!);
  for (const card of partial) {
    const leads = card.lead.map(({ lead }) => lead.split(" "));
    const [first, ...rest] = leads as [string[]];
    const n = rest.reduce((n, lead) => {
      let i = 0;
      while (i < n && lead[i] === first[i]) i++;
      return i;
    }, first.length);
    if (n <= parseRef(card.ref!)!.words.length) continue;
    // The same Products under longer words: groupsFrom would keep every one (no qualifier is left out) and their measure.
    const size = card.measure === "unit" ? card.size : commonest(card.members.map((k) => cat.perUnit[k]!))!;
    const ref = groupRef(first.slice(0, n), { measure: card.measure, size });
    if (parseRef(ref)) Object.assign(card, { ref, name: commonest(card.lead.map(({ leadRaw }) => leadRaw.split(" ").slice(0, n).join(" ")))!, size });
  }
}

/** The cards with a Product priced nearby that `keep` keeps, with those Products only, most nearby stores first, then by name. */
function cardsOf(nr: Near, keep: (k: number) => boolean): Built[] {
  const { db, cat, count } = nr;
  const members = new Map<number, number[]>();
  for (let k = 0; k < count.length; k++) {
    const g = cat.groups[k]!;
    if (count[k] && g >= 0 && keep(k)) (members.get(g) ?? members.set(g, []).get(g)!).push(k);
  }
  const meta = db.$client
    .prepare("SELECT id, ref, name, measure, size, sold_by AS soldBy FROM browse_groups WHERE id IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify([...members.keys()])) as ({ id: number } & Meta)[];
  const cards = build(nr, meta.map(({ id, ...m }) => ({ group: id, meta: m, members: members.get(id)! })));
  narrowHere(nr, cards);
  return cards.sort(byStoresThenName);
}

/** The Products priced nearby on a card of Product type `type` whose names start with `ref`'s words, or the team added to it. */
function refIds({ db, cat, count }: Near, type: ProductType, ref: string) {
  const t = typeIndex(type);
  const words = parseRef(ref)?.words.join(" ");
  const prefixed = words === undefined ? [] : (db.$client.prepare("SELECT id FROM browse_products WHERE words = ? OR substr(words, 1, ?) = ?").pluck().all(words, words.length + 1, `${words} `) as number[]);
  const added = groupEdits(db, [ref]).get(ref)?.added ?? [];
  const addedIds = db.$client.prepare("SELECT id FROM browse_products WHERE code IN (SELECT value FROM json_each(?))").pluck().all(JSON.stringify(added)) as number[];
  return [...new Set([...prefixed, ...addedIds])].filter((k) => k < count.length && count[k] && cat.groups[k]! >= 0 && cat.groupTypes[cat.groups[k]!] === t);
}

/**
 * The card `ref` names among these Products (refIds): the group its words make of them (so a ref a card was narrowed to
 * under a filter opens too), or undefined.
 */
function refCard(nr: Near, ref: string, ids: number[]): Built | undefined {
  const { cat, db } = nr;
  const rows = candidates(nr, ids);
  const word = parseRef(ref);
  const made = word ? undefined : madeGroups(db, [madeId(ref) ?? 0])[0];
  const size = word?.size ?? made;
  const g = word && groupsFrom(word.words, rows, BROWSE).find((g) => g.ref === ref);
  const edit = groupEdits(db, [ref]).get(ref);
  if (!size || (!g && !edit)) return undefined;
  const byCode = new Map(rows.map((p) => [p.code, p]));
  const lookup = (codes: string[]) => codes.flatMap((c) => byCode.get(c) ?? []);
  const mine = editedMembers(lookup(g?.codes ?? []), edit, size, lookup); // the group-members rule over these Products
  if (!mine.length) return undefined;
  const meta = {
    ref, name: edit?.name ?? g?.name ?? word!.words.join(" "), measure: size.measure, soldBy: groupSoldBy(size.measure, mine),
    size: size.measure === "unit" ? size.size : commonest(mine.map((p) => measureOf(p)!.size))!,
  };
  return build(nr, [{ group: cat.groups[mine[0]!.id]!, meta, members: mine.map((p) => p.id) }])[0];
}

const withoutIds = ({ group, members, lead, ...card }: Built): Card => card;

/** One Product type's group cards nearby (at any store without a location). */
export function typeCards(db: Db, storeIds: string[] | null, type: ProductType): Card[] {
  const nr = near(db, storeIds);
  const t = typeIndex(type);
  return cardsOf(nr, (k) => nr.cat.groupTypes[nr.cat.groups[k]!] === t).map(withoutIds);
}

/** A Product on a product page: its pack size (null when unreadable) and its cheapest price nearby (null without a location). */
export type GroupProduct = {
  code: string; name: string; measure: Measure | null; size: number | null; soldBy: SoldBy; minPrice: number | null; storeCount: number;
};

/** A card's Products as its product page lists them, most nearby stores first, then by name. */
function pageProducts(nr: Near, card: Built): GroupProduct[] {
  const { min, count } = nr;
  return candidates(nr, card.members)
    .map(({ id, code, name, unitQty, isWeighted }): GroupProduct => ({
      code, name,
      ...(measureOf({ name, unitQty, isWeighted }) ?? { measure: null, size: null }),
      soldBy: soldByOf({ unitQty, isWeighted }),
      minPrice: min ? min[id]! : null,
      storeCount: count[id]!,
    }))
    .sort(byStoresThenName);
}

/**
 * A group card's product page: the card and its Products priced nearby. Null when these Products make no such card (not
 * sold nearby, or of another Product type).
 */
export function groupPage(db: Db, storeIds: string[] | null, type: ProductType, ref: string) {
  const nr = near(db, storeIds);
  const card = refCard(nr, ref, refIds(nr, type, ref));
  return card ? { card: withoutIds(card), products: pageProducts(nr, card) } : null;
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

type Offer = { product: number; chainId: string; promo: StorePromotion; shelf: number; off: ReturnType<typeof promotionPrice> };
type Ranked = Offer & { each: number | null };
/** The lowest price, then the bigger saving, then the one for everyone. */
const byBestOffer = (a: Ranked, b: Ranked) =>
  (a.each ?? Infinity) - (b.each ?? Infinity) || (b.off?.saving ?? 0) - (a.off?.saving ?? 0) || +(a.promo.audience !== "all") - +(b.promo.audience !== "all");

type Strings = ReturnType<typeof promotionStrings>;
/** An offer's Promotion text as Compare words it (by the kilo when the Product is weighed). */
const offerText = (cat: Catalog, strings: Strings, { product, promo, shelf }: Offer) =>
  promotionText({ ...promo, ...strings.get(promo.rowid)!, weighted: cat.weighted[product] ? 1 : 0 }, shelf);

/**
 * Calls `visit` with every offer at the nearby stores among `promos` (#118's timing; every stored audience counts): one
 * per store, Promotion and Product it covers that the store prices at `shelf`, of Product type `type` when given, of
 * the Products `only` marks when given. One Chain's stores come one after another.
 */
function forEachOffer(
  nr: Near, promos: Map<number, StorePromotion>, type: ProductType | undefined, only: Uint8Array | undefined,
  visit: (k: number, chainId: string, promo: StorePromotion, shelf: number) => void,
) {
  const { cat } = nr;
  const t = type && typeIndex(type);
  const n = cat.groups.length;
  const byChain = [...nr.stores!].sort((a, b) => (a.chainId < b.chainId ? -1 : a.chainId > b.chainId ? 1 : 0));
  for (const { chainId, products, prices, offerProducts, offerPromotions } of byChain) {
    let p = 0; // both lists are in Product order: walk them side by side
    for (let j = 0; j < offerProducts.length; j++) {
      const k = offerProducts[j]!;
      if (k >= n) break; // numbered since the last grouping, as are the rest
      if (only && !only[k]) continue;
      while (p < products.length && products[p]! < k) p++;
      if (p === products.length) break;
      if (products[p] !== k) continue; // no Shelf price here
      const promo = promos.get(offerPromotions[j]!);
      if (promo && (t === undefined || cat.groupTypes[cat.groups[k]!] === t)) visit(k, chainId, promo, prices[p]!);
    }
  }
}

/** The Chain Promotions the nearby stores run on the Products `only` marks (on any when not given), running at `now`. */
function promotionsNear(nr: Near, now: Date, only: Uint8Array | undefined) {
  const max = nr.db.$client.prepare("SELECT coalesce(max(id), 0) FROM chain_promotions").pluck().get() as number;
  const seen = new Uint8Array(max + 1);
  for (const { offerProducts, offerPromotions } of nr.stores!)
    for (let j = 0; j < offerPromotions.length; j++) if (!only || only[offerProducts[j]!]) seen[offerPromotions[j]!] = 1;
  const ids: number[] = [];
  for (let id = 0; id <= max; id++) if (seen[id]) ids.push(id); // in order: SQLite looks them up faster
  return runningPromotionsOf(nr.db, ids, now);
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
function offerOf(k: number, chainId: string, promo: StorePromotion, shelf: number): Ranked {
  const off = promotionPrice(promo, shelf);
  return { product: k, chainId, promo, shelf, off, each: off?.price ?? null };
}

/**
 * The Promotions running at `now` at the stores of `nr` (read with their offers), and per Product on one (optionally of
 * one Product type, of the Products `only` marks) its best offer and the Chains running one on it.
 */
function promotionOffers(nr: Near, now: Date, type?: ProductType, only?: Uint8Array) {
  const promos = promotionsNear(nr, now, only);
  const n = nr.cat.groups.length;
  const best = new Array<Ranked | undefined>(n);
  const chains = new Array<Set<string> | undefined>(n);
  const lastChain = new Array<string | undefined>(n);
  forEachOffer(nr, promos, type, only, (k, chainId, promo, shelf) => {
    if (lastChain[k] !== chainId) {
      lastChain[k] = chainId; // a Chain's stores come one after another, so each Chain is added once
      (chains[k] ??= new Set()).add(chainId);
    }
    const b = best[k];
    if (!b || beats(promo, shelf, b)) best[k] = offerOf(k, chainId, promo, shelf);
  });
  return { nr, promos, only, type, best, chains };
}

/** A card of Products on a Promotion's best offer: the lowest price per kilo, liter or pack. */
const topOffer = ({ nr: { cat }, best }: ReturnType<typeof promotionOffers>, card: Built) =>
  card.members.map((k) => best[k]!).map((o) => ({ ...o, each: o.off ? o.off.price / cat.perUnit[o.product]! : null })).sort(byBestOffer)[0]!;

/** A card of Products on a Promotion, headlined by its best offer `top`. */
function promoCard({ nr: { cat }, chains }: ReturnType<typeof promotionOffers>, strings: Strings, { group, members, lead, ...card }: Built, top: Ranked): PromoCard {
  return {
    ...card,
    type: PRODUCT_TYPES[cat.groupTypes[group]!]!,
    promoPrice: top.each === null ? null : round2(top.each),
    shelfPrice: top.each === null ? null : round2(top.shelf / cat.perUnit[top.product]!),
    saving: top.off?.saving ?? null,
    kind: top.promo.kind,
    minQty: top.promo.minQty,
    amount: top.promo.amount,
    audience: top.promo.audience,
    text: offerText(cat, strings, top),
    chainCount: new Set(members.flatMap((k) => [...chains[k]!])).size,
  };
}

/**
 * Cards of the Products with a Promotion running at `now` at `storeIds`, optionally of one Product type or at one
 * Chain's stores. Biggest saving first, those with no price last.
 */
export function promotionCards(db: Db, storeIds: string[], now: Date, filters: { type?: ProductType; chain?: string } = {}): PromoCard[] {
  const promoted = promotionOffers(near(db, storeIds, { chain: filters.chain, offers: true }), now, filters.type);
  const cards = cardsOf(promoted.nr, (k) => !!promoted.best[k]).map((card) => ({ card, top: topOffer(promoted, card) }));
  const strings = promotionStrings(db, cards.map(({ top }) => top.promo.rowid));
  return cards.map(({ card, top }) => promoCard(promoted, strings, card, top)).sort((a, b) => (b.saving ?? -1) - (a.saving ?? -1));
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
export function promotionPage(db: Db, storeIds: string[], now: Date, type: ProductType, ref: string) {
  const nr = near(db, storeIds, { offers: true });
  const ids = refIds(nr, type, ref);
  const only = new Uint8Array(nr.cat.groups.length);
  for (const k of ids) only[k] = 1;
  const promoted = promotionOffers(nr, now, type, only); // only this page's Products
  const { cat } = nr;
  const card = refCard(nr, ref, ids.filter((k) => promoted.best[k]));
  if (!card) return null;
  narrowHere(promoted.nr, [card]); // named by what it holds, as its card on Promotions is
  const mine = new Set(card.members);
  const offers: Ranked[] = [];
  forEachOffer(nr, promoted.promos, type, only, (k, chainId, promo, shelf) => mine.has(k) && offers.push(offerOf(k, chainId, promo, shelf)));
  const top = topOffer(promoted, card);
  const strings = promotionStrings(db, [top, ...offers].map((o) => o.promo.rowid));
  const lines = new Map<number, Map<string, Ranked>>(); // per Product, per Chain and PromotionID: its lowest price at the Chain's nearby stores
  for (const o of offers) {
    const byPromo = lines.get(o.product) ?? lines.set(o.product, new Map()).get(o.product)!;
    const key = `${o.chainId} ${strings.get(o.promo.rowid)!.id}`;
    const b = byPromo.get(key);
    if (!b || byBestOffer(o, b) < 0) byPromo.set(key, o);
  }
  const chainsOf = (k: number) => {
    const ranked = [...lines.get(k)!.values()].sort(byBestOffer);
    return [...new Set(ranked.map((o) => o.chainId))].flatMap((id) => ranked.filter((o) => o.chainId === id)).map((o): ChainPromo => ({
      chainId: o.chainId,
      promoPrice: o.off?.price ?? null,
      shelfPrice: o.off ? o.shelf : null,
      saving: o.off?.saving ?? null,
      kind: o.promo.kind, minQty: o.promo.minQty, amount: o.promo.amount, audience: o.promo.audience,
      text: o.off ? offerText(cat, strings, o) : strings.get(o.promo.rowid)!.description, // no price: the Chain's own words
    }));
  };
  const idOf = new Map(card.codes.map((code, i) => [code, card.members[i]!]));
  return { card: promoCard(promoted, strings, card, top), products: pageProducts(promoted.nr, card).map((p) => ({ ...p, chains: chainsOf(idOf.get(p.code)!) })) };
}
