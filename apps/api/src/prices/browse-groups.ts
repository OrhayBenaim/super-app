// Browse's group cards: each Product on exactly one, by the rules search uses (docs/adr/0001), worked out over every
// Product priced at any store and stored by refreshBrowse at the start and end of each Price sync. A request only looks
// up which of them have Products nearby (browse.ts). A Product new since the last grouping shows once it is grouped.
import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import type { SoldBy } from "@grocer/shared/quantity";
import type { Db } from "#/db/index.ts";
import { f64, i32, pack, packMissingStores, prunePromotions, writeCatalog } from "#/prices/browse-data.ts";
import {
  claims, commonest, editedSize, groupEdits, groupSoldBy, groupsFrom, madeId, measureOf, nameWords, parseRef, soldByOf, teamEdits, withoutSizes,
  type Measure, type TeamEdits,
} from "#/prices/groups.ts";

type Product = { code: string; name: string; unitQty: string | null; isWeighted: number; type: ProductType; minPrice: number };

/** A Product's first normalized word, unless it is a size ("500 גרם ..."), which never names a group. */
function firstWord(name: string) {
  const words = nameWords(name).map((w) => w.norm);
  const first = withoutSizes(words)[0];
  return first !== undefined && first === words[0] ? [first] : [];
}

const ownWords = (name: string) => withoutSizes(nameWords(name).map((w) => w.norm));

export const BROWSE = { minProducts: 1, everyMeasure: true };

/** Per Product type, the groups `wordsOf` each Product's name makes, one per measure (and pack count), lone Products included. */
function groupsBy(products: Product[], wordsOf: (name: string) => string[]) {
  const buckets = new Map<string, { type: ProductType; words: string[]; members: Product[] }>();
  for (const p of products) {
    const words = wordsOf(p.name);
    if (!words.length) continue;
    const key = `${p.type}|${words.join(" ")}`;
    const bucket = buckets.get(key) ?? { type: p.type, words, members: [] };
    bucket.members.push(p);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].flatMap(({ type, words, members }) =>
    groupsFrom(words, members, BROWSE)
      .map((g) => narrowed(g, words, members))
      .filter((g) => parseRef(g.ref)) // a ref the List and Compare accept
      .map((g) => ({ ...g, ref: g.ref as string | null, type })),
  );
}

/** A name's normalized words before its first number or size ("דיאט קולה 1.5 ליטר סופר" -> דיאט קולה). */
export function leadWords(name: string) {
  const words = nameWords(name).map((w) => w.norm);
  const kept = withoutSizes(words);
  const end = words.findIndex((w, i) => /^\d/.test(w) || w !== kept[i]);
  return end < 0 ? words : words.slice(0, end);
}

/**
 * The group named by every lead word its Products share ("דיאט קוקה קולה", not just "דיאט"), so a card says what it
 * holds and Compare prices only those; the group itself when they share no more than `words`.
 */
function narrowed<G extends ReturnType<typeof groupsFrom>[number]>(group: G, words: string[], members: Product[]) {
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

/** A card for one Product with no group ref: Add matches its code. A pack of one without a size. */
function loneCard(p: Product) {
  const { measure, size } = measureOf(p) ?? { measure: "unit" as const, size: 1 };
  return { ref: null, name: p.name, measure, soldBy: soldByOf(p), size, codes: [p.code], type: p.type };
}

type BrowseCard = { ref: string | null; name: string; measure: Measure; soldBy: SoldBy; size: number; codes: string[]; type: ProductType };

/**
 * The team's edits over these cards of `products` (docs/adr/0007): a Product the team added to a group moves to the card
 * `claims` gives it, and one removed from its card's group to the card its own words make, or alone when that is the
 * group it left. A renamed group's card takes its name.
 */
function withEdits(t: TeamEdits, cards: BrowseCard[], products: Product[]): BrowseCard[] {
  const { edits, made } = t;
  if (!edits.size) return cards;
  const byCode = new Map(products.map((p) => [p.code, p]));
  const claimed = claims(t, byCode); // code -> the ref whose card it moves to
  const touched = new Set<BrowseCard>();
  const removed: Product[] = [];
  const out = cards.map((card) => {
    const edit = card.ref === null ? undefined : edits.get(card.ref);
    const codes = card.codes.filter((code) => {
      if (claimed.has(code)) return claimed.get(code) === card.ref;
      if (edit?.removed.has(code)) removed.push(byCode.get(code)!);
      return !edit?.removed.has(code);
    });
    const next = { ...card, codes, name: edit?.name ?? card.name };
    if (codes.length !== card.codes.length) touched.add(next);
    return next;
  });
  const cardFor = (type: ProductType, ref: string | null) => (ref === null ? undefined : out.find((c) => c.ref === ref && (madeId(ref) !== null || c.type === type)));
  for (const [code, ref] of claimed) {
    let card = cardFor(byCode.get(code)!.type, ref) ?? out.find((c) => c.ref === ref);
    if (!card) {
      const { measure, size } = editedSize(t, ref)!;
      card = { ref, name: edits.get(ref)!.name ?? parseRef(ref)!.words.join(" "), measure, size, soldBy: "unit", codes: [], type: made.get(ref)?.type ?? byCode.get(code)!.type };
      out.push(card);
    }
    if (!card.codes.includes(code)) card.codes.push(code);
    touched.add(card);
  }
  for (const card of groupsOf(removed)) {
    for (const code of card.codes) {
      const left = card.ref !== null && edits.get(card.ref)?.removed.has(code); // the group it was removed from: alone
      const into = left ? undefined : cardFor(card.type, card.ref);
      const next = into ?? (left ? loneCard(byCode.get(code)!) : { ...card, codes: [] });
      if (!into) out.push(next);
      if (!left) {
        if (!next.codes.includes(code)) next.codes.push(code);
        touched.add(next);
      }
    }
  }
  for (const card of touched) {
    const members = card.codes.map((c) => byCode.get(c)!);
    card.soldBy = card.ref === null ? card.soldBy : groupSoldBy(card.measure, members);
    if (card.measure !== "unit" && members.length) card.size = commonest(members.map((p) => measureOf(p)!.size))!;
  }
  return out.filter((c) => c.codes.length);
}

/**
 * The group cards of these Products, each Product on exactly one: per Product type, the groups search would make from
 * each Product's first normalized word (every measure, lone Products included). A Product none holds (a qualifier such
 * as סויה, its size first, no readable size) gets its own: the group its own words make, or else a card with no group ref.
 */
export function groupsOf(products: Product[]) {
  const grouped = groupsBy(products, firstWord);
  const held = new Set(grouped.flatMap((g) => g.codes));
  const refs = new Set(grouped.map((g) => `${g.type}|${g.ref}`));
  const own = groupsBy(products.filter((p) => !held.has(p.code)), ownWords).filter((g) => !refs.has(`${g.type}|${g.ref}`));
  for (const code of own.flatMap((g) => g.codes)) held.add(code);
  return [...grouped, ...own, ...products.filter((p) => !held.has(p.code)).map(loneCard)];
}

/** What a grouped Product's price is divided by: its kilos or liters (groupsFrom's price per kilo or liter), 1 in a unit group. */
const perUnitOf = (measure: string, p: { name: string; unitQty: string | null; isWeighted: number }) => (measure === "unit" ? 1 : measureOf(p)!.size);

type Numbered = Omit<Product, "minPrice"> & { id: number; storeCount: number }; // id: its browse_products id
const BROWSE_PRODUCTS =
  "SELECT b.id, p.code, p.name, p.unit_qty AS unitQty, p.is_weighted AS isWeighted, coalesce(p.product_type, 'other') AS type, p.store_count AS storeCount FROM browse_products b JOIN products p ON p.code = b.code";

/**
 * Stores browse's group cards over every Product some store prices, with what browse_catalog keeps per Product and per
 * group, each Product's code and name words (for narrowing a card to the Products it holds at a request) and its
 * products.store_count, in one transaction.
 * An untyped Product counts as Other.
 */
function storeGroups(db: Db) {
  const sqlite = db.$client;
  const n = (sqlite.prepare("SELECT coalesce(max(id), 0) + 1 FROM browse_products").pluck().get() as number);
  const lists = (sqlite.prepare("SELECT products FROM store_browse").pluck().all() as Buffer[]).map(i32);
  const stores = new Int32Array(n);
  for (const list of lists) for (const k of list) stores[k]!++;
  const rows = sqlite.prepare(`${BROWSE_PRODUCTS} ORDER BY p.code`).all() as Numbered[];
  const priced = rows.filter((p) => stores[p.id]).map((p) => ({ ...p, minPrice: 0 }));
  const groups = withEdits(teamEdits(db), groupsOf(priced), priced);
  const byCode = new Map(priced.map((p) => [p.code, p]));
  const c = {
    groups: new Int32Array(n).fill(-1), perUnit: new Float64Array(n).fill(1), weighted: new Uint8Array(n), stores,
    groupTypes: new Uint8Array(groups.length), groupStores: new Int32Array(groups.length),
  };
  const names = new Array<string>(n).fill("");
  groups.forEach((g, i) => {
    c.groupTypes[i] = PRODUCT_TYPES.indexOf(g.type);
    for (const code of g.codes) {
      const p = byCode.get(code)!;
      c.groups[p.id] = i;
      c.weighted[p.id] = p.isWeighted ? 1 : 0;
      const words = nameWords(p.name);
      const lead = words.slice(0, leadWords(p.name).length); // leadWords is a start of nameWords
      names[p.id] = [p.code, lead.map((w) => w.norm).join(" "), lead.map((w) => w.raw).join(" ")].join("\t");
      c.perUnit[p.id] = perUnitOf(g.measure, p);
    }
  });
  const lastList = new Int32Array(groups.length).fill(-1);
  lists.forEach((list, s) => {
    for (const k of list) {
      const g = c.groups[k]!;
      if (g >= 0 && lastList[g] !== s) {
        lastList[g] = s;
        c.groupStores[g]!++;
      }
    }
  });
  const insert = sqlite.prepare("INSERT INTO browse_groups (id, type, ref, name, measure, size, sold_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const setWords = sqlite.prepare("UPDATE browse_products SET words = ? WHERE id = ?");
  const words = priced.map((p) => [nameWords(p.name).map((w) => w.norm).join(" "), p.id] as const);
  const setStores = sqlite.prepare("UPDATE products SET store_count = ? WHERE code = ?");
  const recounted = rows.filter((p) => p.storeCount !== stores[p.id]);
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM browse_groups").run();
    groups.forEach((g, i) => insert.run(i, g.type, g.ref, g.name, g.measure, g.size, g.soldBy));
    for (const w of words) setWords.run(...w);
    for (const p of recounted) setStores.run(stores[p.id], p.code);
    writeCatalog(sqlite, c, names);
  })();
}

/**
 * Brings browse's copy up to date with prices, Promotions and Product types: packs stores ingest hasn't (data from before
 * browse's copy), groups every priced Product again and drops Chain Promotions no store lists.
 */
export async function refreshBrowse(db: Db) {
  await packMissingStores(db);
  storeGroups(db);
  prunePromotions(db.$client);
}

/**
 * Moves these grouped Products (those a group edit touched, or one whose Product type the operator just set) each onto
 * the card its own name makes after the team's edits (withEdits), of its Product type, or a new one, so Home shows them
 * without a Price sync: refreshBrowse groups every Product again, seconds on real data with every request waiting.
 * One pass: the catalog and the edits are read once and written once, in one transaction. A card a Product left keeps
 * its store count until the next refresh.
 */
export function regroupProducts(db: Db, codes: string[]) {
  const sqlite = db.$client;
  const row = sqlite.prepare("SELECT groups, per_unit, stores, group_types, group_stores FROM browse_catalog WHERE id = 1").raw().get() as Buffer[] | undefined;
  if (!row) return; // not grouped yet: the next refresh groups them
  const [groups, perUnit, stores] = [i32(row[0]!).slice(), f64(row[1]!).slice(), i32(row[2]!)];
  const groupTypes = [...row[3]!];
  const groupStores = [...i32(row[4]!)];
  const t = teamEdits(db);
  const product = sqlite.prepare(`${BROWSE_PRODUCTS} WHERE p.code = ?`);
  const moves = codes.flatMap((code) => {
    const p = product.get(code) as Numbered | undefined;
    if (!p || (groups[p.id] ?? -1) < 0) return []; // not grouped yet: the next refresh groups it with its type
    const one = { ...p, minPrice: 0 };
    return [{ p, card: withEdits(t, groupsOf([one]), [one]).find((c) => c.codes.includes(code))! }];
  });
  if (!moves.length) return;
  // Each card's id by Product type and ref, the first if several: one scan of browse_groups (it has no index on ref).
  const key = (type: string, ref: string) => `${type}|${ref}`;
  const ids = new Map<string, number>();
  const refs = JSON.stringify(moves.flatMap((m) => m.card.ref ?? []));
  const known = sqlite.prepare("SELECT id, type, ref FROM browse_groups WHERE ref IN (SELECT value FROM json_each(?)) ORDER BY id").all(refs) as { id: number; type: string; ref: string }[];
  for (const { id, type, ref } of known) if (!ids.has(key(type, ref))) ids.set(key(type, ref), id);
  const insert = sqlite.prepare("INSERT INTO browse_groups (id, type, ref, name, measure, size, sold_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const remeasure = sqlite.prepare("UPDATE browse_groups SET measure = ?, size = ? WHERE id = ?");
  sqlite.transaction(() => {
    for (const { p, card } of moves) {
      const same = card.ref === null ? undefined : ids.get(key(card.type, card.ref));
      const g = same ?? groupTypes.length;
      groupTypes[g] = PRODUCT_TYPES.indexOf(card.type);
      if (same === undefined) {
        groupStores[g] = stores[p.id]!;
        insert.run(g, card.type, card.ref, card.name, card.measure, card.size, card.soldBy);
        if (card.ref !== null) ids.set(key(card.type, card.ref), g);
      } else if (madeId(card.ref!) !== null) remeasure.run(card.measure, card.size, g); // a Made group whose measure the team changed
      groups[p.id] = g;
      perUnit[p.id] = perUnitOf(card.measure, p);
    }
    sqlite
      .prepare("UPDATE browse_catalog SET groups = ?, per_unit = ?, group_types = ?, group_stores = ? WHERE id = 1")
      .run(pack(groups), pack(perUnit), pack(Uint8Array.from(groupTypes)), pack(Int32Array.from(groupStores)));
  })();
}

/** Gives the cards of a renamed group (a Made group or a word group) the group's name. */
export function restyleCards(db: Db, ref: string) {
  const name = groupEdits(db, [ref]).get(ref)?.name;
  if (name) db.$client.prepare("UPDATE browse_groups SET name = ? WHERE ref = ?").run(name, ref);
}
