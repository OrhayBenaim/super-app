// Product groups (CONTEXT.md, docs/adr/0001): products that are one thing to a shopper, worked out from their names at
// query time and never stored. A group is named by its "group ref": normalized words + measure (+ the pack count when
// counted by the unit), e.g. "בורגול|kg", "ביצ|unit|12". The team's edits and Made groups (`made:<id>`) are stored and
// applied after the word rules (docs/adr/0007): every reader goes through groupMembers or editedCodes.
import { z } from "zod";
import type { ProductType } from "@grocer/shared/product-types";
import type { SoldBy } from "@grocer/shared/quantity";
import type { Db } from "#/db/index.ts";
import { productsByCode, productsMatching } from "#/db/products.ts";

/** Words that never tell two products apart: origin, grade, "by weight", "loose" (loose is the default). */
const NOISE = new Set(["במשקל", "משקל", "שקיל", "תפזורת", "בתפזורת", "ישראל", "ישראלי", "ישראלית", "מובחר", "מובחרת", "מובחרים", "טרי", "טריה", "טריים", "לקג"]);
/** Words that mark a bag, net or pack: those stay a separate product from loose. */
const PACKED = new Set(["ארוז", "ארוזה", "ארוזים", "ארוזות", "בשקית", "ברשת", "מארז"]);
/** Skipped at the start of a name, so "גבינת קוטג" is cottage cheese. */
const LEADING = new Set(["גבינת", "גבינה"]);
/** A dish ("עם"), a substitute, organic: each spelling maps to one word. */
const QUALIFIERS: [RegExp, string][] = [
  [/^עם$/, "עם"], [/^טבעונ/, "טבעוני"], [/^צמחי/, "צמחי"], [/^קוקוס$/, "קוקוס"], [/^שקד/, "שקד"], [/^סויה$/, "סויה"],
  [/^שיבולת$/, "שיבולת"], [/^אורגנ/, "אורגני"],
];
/** A product with one of these words (or packed) is only in a group whose words have it too. */
const QUALIFIER_WORDS = new Set(["ארוז", ...QUALIFIERS.map(([, w]) => w)]);

const WEIGHT: Record<string, number> = { גרם: 0.001, גרמים: 0.001, גר: 0.001, ג: 0.001, קג: 1, קילו: 1, קילוגרם: 1, קילוגרמים: 1 };
const VOLUME: Record<string, number> = { מל: 0.001, מיליליטר: 0.001, ל: 1, ליטר: 1, ליטרים: 1 };
const COUNT = new Set(["יח", "יחי", "יחידה", "יחידות"]);
const EGG_SIZE = /^(s|m|l|xl)$/i;
const isNumber = (w: string) => /^\d/.test(w);
const isUnit = (w: string) => w in WEIGHT || w in VOLUME || COUNT.has(w);

/** Letter runs and numbers: splits at spaces, punctuation, % and digit/letter boundaries ("קוטג%5מהדרין250גר"). */
const rawWords = (s: string) =>
  s.replace(/ק["״]ג/g, "קג").replace(/מ["״]ל/g, "מל").replace(/תפו["״]א/g, "תפוח אדמה").match(/\d+(?:\.\d+)?|\p{L}+/gu) ?? [];

/** Spelling and plural forms of one word: עגבנייה, עגבנית, עגבניות -> עגבניה; בננות -> בננה; מלפפונים -> מלפפון. */
const stem = (w: string) => {
  const s = w.replace(/יי/g, "י");
  return s.length < 4 ? s : s.replace(/ות$/, "ה").replace(/ים$/, "").replace(/ית$/, "יה");
};

type Word = { raw: string; norm: string };

/** A name's words without noise, each with its normalized form, and without a leading "גבינת". */
export function nameWords(name: string): Word[] {
  const words = rawWords(name)
    .filter((w) => !NOISE.has(w))
    .map((raw) => {
      const s = stem(raw.toLowerCase());
      return { raw, norm: PACKED.has(raw) ? "ארוז" : (QUALIFIERS.find(([re]) => re.test(s))?.[1] ?? s) };
    });
  return words.length > 1 && LEADING.has(words[0]!.norm) ? words.slice(1) : words;
}

/** Normalized words without pack sizes ("500 גרם", "12 יח", a lone unit): a size never names a group. "3" of "3%" stays. */
export const withoutSizes = (words: string[]) =>
  words.filter((w, i) => !isUnit(w) && !(isNumber(w) && isUnit(words[i + 1] ?? "")));

/** The spellings a stemmed word can have in a name: stem() folds "יי" to "י", so each of the first 3 "י" may be either. */
function spellings(w: string) {
  const [first = "", ...rest] = w.split("י");
  return rest.reduce((forms, part, i) => forms.flatMap((f) => (i < 3 ? [`${f}י${part}`, `${f}יי${part}`] : [`${f}י${part}`])), [first]);
}

/** FTS5 prefix terms that find every product a group of these words can hold ("בננה" -> "בננ"* also finds בננות). */
export const ftsMatch = (words: string[]) =>
  words
    .filter((w) => w !== "ארוז") // packed is also בשקית, ברשת...
    .map((w) => {
      const terms = spellings(w.length >= 4 ? w.replace(/י?ה$/, "") : w).map((s) => `"${s}"*`);
      return terms.length > 1 ? `(${terms.join(" OR ")})` : terms[0];
    })
    .join(" AND "); // FTS5 has no implicit AND next to a parenthesized group

export type Measure = "kg" | "l" | "unit";
/** Kilos, liters, or the pack count. */
export type Size = { measure: Measure; size: number };

function sizeIn(words: string[]): Size | null {
  for (let i = 0; i < words.length - 1; i++) {
    const n = Number(words[i]);
    const unit = words[i + 1]!;
    if (!isNumber(words[i]!) || !(n > 0)) continue;
    if (unit in WEIGHT) return { measure: "kg", size: n * WEIGHT[unit]! };
    if (unit in VOLUME) return { measure: "l", size: n * VOLUME[unit]! };
  }
  return null;
}

function countIn(words: string[]) {
  for (let i = 0; i < words.length; i++) {
    const n = Number(words[i]);
    if (!isNumber(words[i]!) || !Number.isInteger(n) || n < 1) continue;
    if (COUNT.has(words[i + 1] ?? "") || EGG_SIZE.test(words[i + 1] ?? "") || EGG_SIZE.test(words[i - 1] ?? "")) return n; // "12 יח", "M12"
  }
  return null;
}

type Sized = { name: string; unitQty: string | null; isWeighted: boolean | number };

/**
 * How a product is measured and its size: weighed products by the kilo; otherwise grams/kilos or ml/liters from the
 * unit quantity, else from the name, else a pack count. Null when no size can be read. The chains' own unit price is
 * not used: it is per kilo at some chains and per 100 g at others.
 */
export function measureOf(p: Sized): Size | null {
  if (p.isWeighted) return { measure: "kg", size: 1 };
  const qty = rawWords(p.unitQty ?? "");
  const name = rawWords(p.name);
  const size = sizeIn(qty) ?? sizeIn(name);
  if (size) return size;
  const n = Number(qty[0]);
  const count = countIn(name) ?? (COUNT.has(qty[1] ?? "") && Number.isInteger(n) && n >= 1 ? n : null);
  return count ? { measure: "unit", size: count } : null;
}

/**
 * Sold by weight: the price file flags the product as weighted and its unit is a weight (kilos or grams), so its price
 * is per kilo. A weighted product counted in "יחידות" is sold by the unit, as is everything else.
 */
export const soldByOf = (p: Pick<Sized, "unitQty" | "isWeighted">): SoldBy =>
  p.isWeighted && rawWords(p.unitQty ?? "").some((w) => w in WEIGHT) ? "weight" : "unit";

/** A group is sold by weight when it is measured by the kilo and most of its products are sold by weight (produce). */
export const groupSoldBy = (measure: Measure, products: Sized[]): SoldBy =>
  measure === "kg" && commonest(products.map(soldByOf)) === "weight" ? "weight" : "unit";

const startsWith = (words: Word[], group: string[]) => group.every((w, i) => words[i]?.norm === w);

/** True when a name with these words starts with the group's words and has no qualifier the group's words lack. */
export const startsGroup = (words: Word[], group: string[]) =>
  startsWith(words, group) && words.every((w) => !QUALIFIER_WORDS.has(w.norm) || group.includes(w.norm));

/** Same measure, and for the unit the same pack count. */
export const sameMeasure = (a: Size | null, b: Size) => !!a && a.measure === b.measure && (b.measure !== "unit" || a.size === b.size);

export const groupRef = (words: string[], { measure, size }: Size) => [words.join(" "), measure, ...(measure === "unit" ? [size] : [])].join("|");

/** A group ref's words and measure, or null when it is not one. A kilo or liter group's size is always 1. */
export function parseRef(ref: string): { words: string[]; size: Size } | null {
  const [words = "", measure, count, ...rest] = ref.split("|");
  const size = measure === "unit" ? Number(count) : 1;
  if (rest.length || !["kg", "l", "unit"].includes(measure!) || !Number.isInteger(size) || size < 1) return null;
  if (measure !== "unit" && count !== undefined) return null;
  // Words are what nameWords makes (letter runs, numbers): anything else would be FTS syntax.
  if (!words.split(" ").every((w) => /^[\p{L}\p{N}.]+$/u.test(w))) return null;
  // A one-letter first word is a prefix search over a large share of the catalog in Compare.
  if (words.split(" ")[0]!.length < 2) return null;
  return { words: words.split(" "), size: { measure: measure as Measure, size } };
}

/** A Made group's id from its ref `made:<id>`, or null when the ref is not one. */
export function madeId(ref: string) {
  const m = /^made:([1-9]\d{0,9})$/.exec(ref);
  return m ? Number(m[1]) : null;
}
export const madeRef = (id: number) => `made:${id}`;

/** A group ref, words or Made, as items and Compare receive it. */
export const groupRefSchema = z.string().trim().min(1).max(200).refine((r) => parseRef(r) !== null || madeId(r) !== null, "invalid group ref");

export type MadeGroup = Size & { id: number; ref: string; name: string; type: ProductType };
/** The Made groups, or those with these ids. */
export function madeGroups(db: Db, ids?: number[]): MadeGroup[] {
  const rows = db.$client
    .prepare(`SELECT id, name, product_type AS type, measure, size FROM made_groups ${ids ? "WHERE id IN (SELECT value FROM json_each(?))" : ""} ORDER BY id`)
    .all(...(ids ? [JSON.stringify(ids)] : [])) as Omit<MadeGroup, "ref">[];
  return rows.map((g) => ({ ...g, ref: madeRef(g.id) }));
}

/** A group's edits: its name (a Made group's own), the Products the team added (a Made group's members) and removed. */
export type GroupEdit = { name: string | null; added: string[]; removed: Set<string> };
/** The edits to these groups (to every edited or Made group when not given), by ref. A group with none has no entry. */
export function groupEdits(db: Db, refs?: string[]) {
  const sqlite = db.$client;
  const where = refs ? "WHERE ref IN (SELECT value FROM json_each(@refs))" : "";
  const arg = refs ? [{ refs: JSON.stringify(refs) }] : [];
  const edits = new Map<string, GroupEdit>();
  const edit = (ref: string) => edits.get(ref) ?? edits.set(ref, { name: null, added: [], removed: new Set() }).get(ref)!;
  const named = sqlite.prepare(`SELECT ref, name FROM group_names ${where}`).all(...arg) as { ref: string; name: string }[];
  const made = madeGroups(db, refs?.flatMap((r) => madeId(r) ?? []));
  for (const { ref, name } of [...named, ...made]) edit(ref).name = name;
  const rows = sqlite.prepare(`SELECT ref, code, added FROM group_products ${where} ORDER BY rowid`).all(...arg) as { ref: string; code: string; added: number }[];
  for (const { ref, code, added } of rows) {
    if (added) edit(ref).added.push(code);
    else edit(ref).removed.add(code);
  }
  return edits;
}

/** The group-members rule (docs/adr/0007): the word rules' members less those the team removed, then those it added. */
export function editedCodes(wordCodes: string[], edit: GroupEdit | undefined) {
  if (!edit) return wordCodes;
  const word = new Set(wordCodes);
  return [...wordCodes.filter((c) => !edit.removed.has(c)), ...edit.added.filter((c) => !word.has(c))];
}

/** The group named by a product's own normalized name, sizes dropped: where a former Produce-group item moves to. */
export function ownGroupRef(p: Sized) {
  const words = withoutSizes(nameWords(p.name).map((w) => w.norm));
  const size = measureOf(p);
  return words.length && size ? groupRef(words, size) : null;
}

/** The value seen most often (the first seen among equals). */
export function commonest<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  for (const [v, n] of counts) if (best === undefined || n > counts.get(best)!) best = v;
  return best;
}

/** Up to 6 next words (shown as typed) that 2+ of these names have right after the group's words, commonest first. */
function refinementsOf(names: Word[][], at: number) {
  const next = names.flatMap((words) => {
    const w = words[at];
    return w && !isNumber(w.norm) && !isUnit(w.norm) && w.norm !== "עם" ? [w] : [];
  });
  const tally = new Map<string, number>();
  for (const w of next) tally.set(w.norm, (tally.get(w.norm) ?? 0) + 1);
  return [...tally]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([norm]) => commonest(next.filter((w) => w.norm === norm).map((w) => w.raw))!);
}

export type Candidate = Sized & { code: string; minPrice: number };
/** Search keeps the measure most members have and groups of 2+; browse keeps every measure and lone products. */
export type GroupRules = { minProducts: number; everyMeasure: boolean };

/**
 * The groups the `group` words name among candidates: products whose names start with them, measured the way most of
 * them are (or each measure, with `everyMeasure`), one group per pack count when counted by the unit, each with
 * `minProducts`+ products. `minPrice` is per kilo or liter, or per pack. Refinements come from every candidate that
 * starts with the words, qualifiers such as "אורגני" included.
 */
export function groupsFrom(group: string[], candidates: Candidate[], { minProducts, everyMeasure }: GroupRules) {
  if (!group.length) return [];
  const prefixed = candidates
    .map((p) => ({ ...p, words: nameWords(p.name), size: measureOf(p) }))
    .filter((p) => p.size && startsWith(p.words, group));
  const members = prefixed.filter((p) => startsGroup(p.words, group));
  const all = members.map((p) => p.size!.measure);
  const measures = everyMeasure ? [...new Set(all)] : [commonest(all)].filter((m) => m !== undefined);
  const sizes = measures.flatMap((measure): Size[] =>
    measure === "unit" ? [...new Set(members.filter((p) => p.size!.measure === "unit").map((p) => p.size!.size))].map((size) => ({ measure, size })) : [{ measure, size: 1 }],
  );
  return sizes.flatMap((size) => {
    const { measure, size: count } = size;
    const inGroup = members.filter((p) => sameMeasure(p.size, size));
    if (inGroup.length < minProducts) return [];
    return [{
      ref: groupRef(group, size),
      name: commonest(inGroup.map((p) => p.words.slice(0, group.length).map((w) => w.raw).join(" ")))!,
      measure,
      soldBy: groupSoldBy(measure, inGroup),
      size: measure === "unit" ? count : commonest(inGroup.map((p) => p.size!.size))!,
      minPrice: Math.min(...inGroup.map((p) => (measure === "unit" ? p.minPrice : p.minPrice / p.size!.size))),
      refinements: refinementsOf(prefixed.filter((p) => sameMeasure(p.size, size)).map((p) => p.words), group.length),
      codes: inGroup.map((p) => p.code),
    }];
  });
}

/** The groups search shows for the `group` words: the commonest measure, 2+ products each. */
export const searchGroups = (group: string[], candidates: Candidate[]) => groupsFrom(group, candidates, { minProducts: 2, everyMeasure: false });

/**
 * Every product in the group the ref names (word rules, then the team's edits), with its size (kilos, liters or pack
 * count), how the group is sold and its measure (`size` null, and no members, for a Made group that is gone). A Product
 * measured another way than the group never counts.
 */
export function groupMembers(db: Db, ref: string) {
  const word = parseRef(ref);
  const made = word ? undefined : madeGroups(db, [madeId(ref) ?? 0])[0];
  const size: Size | null = word?.size ?? (made ? { measure: made.measure, size: made.size } : null);
  if (!size) return { members: [], soldBy: "unit" as SoldBy, size };
  const match = word && ftsMatch(word.words);
  const found = match ? productsMatching(db, match).filter((p) => startsGroup(nameWords(p.name), word.words)) : [];
  const codes = editedCodes(found.map((p) => p.code), groupEdits(db, [ref]).get(ref));
  const byCode = new Map(found.map((p) => [p.code, p]));
  for (const p of productsByCode(db, codes.filter((c) => !byCode.has(c)))) byCode.set(p.code, p);
  const members = codes.flatMap((code) => {
    const p = byCode.get(code);
    const own = p && measureOf(p);
    return p && own && sameMeasure(own, size) ? [{ ...p, size: own.size }] : [];
  });
  return { members, soldBy: groupSoldBy(size.measure, members), size };
}
