// Product groups (CONTEXT.md, docs/adr/0001): products that are one thing to a shopper, worked out from their names at
// query time and never stored. A group is named by its "group ref": normalized words + measure (+ the pack count when
// counted by the unit), e.g. "בורגול|kg", "ביצ|unit|12".
import { z } from "zod";

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

const startsWith = (words: Word[], group: string[]) => group.every((w, i) => words[i]?.norm === w);

/** True when a name with these words starts with the group's words and has no qualifier the group's words lack. */
export const startsGroup = (words: Word[], group: string[]) =>
  startsWith(words, group) && words.every((w) => !QUALIFIER_WORDS.has(w.norm) || group.includes(w.norm));

/** Same measure, and for the unit the same pack count. */
export const sameMeasure = (a: Size | null, b: Size) => !!a && a.measure === b.measure && (b.measure !== "unit" || a.size === b.size);

const groupRef = (words: string[], { measure, size }: Size) => [words.join(" "), measure, ...(measure === "unit" ? [size] : [])].join("|");

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

/** A group ref, as items and Compare receive it. */
export const groupRefSchema = z.string().trim().min(1).max(200).refine((r) => parseRef(r) !== null, "invalid group ref");

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

type Candidate = Sized & { code: string; minPrice: number };

/**
 * The groups the `group` words name among search candidates: products whose names start with them, measured the way
 * most of them are, one group per pack count when counted by the unit, each with 2+ products. `minPrice` is per kilo
 * or liter, or per pack. Refinements come from every candidate that starts with the words, qualifiers such as "אורגני"
 * included.
 */
export function searchGroups(group: string[], candidates: Candidate[]) {
  if (!group.length) return [];
  const prefixed = candidates
    .map((p) => ({ ...p, words: nameWords(p.name), size: measureOf(p) }))
    .filter((p) => p.size && startsWith(p.words, group));
  const members = prefixed.filter((p) => startsGroup(p.words, group));
  const measure = commonest(members.map((p) => p.size!.measure));
  if (!measure) return [];
  const counts = measure === "unit" ? [...new Set(members.filter((p) => p.size!.measure === "unit").map((p) => p.size!.size))] : [1];
  return counts.flatMap((count) => {
    const size: Size = { measure, size: count };
    const inGroup = members.filter((p) => sameMeasure(p.size, size));
    if (inGroup.length < 2) return [];
    return [{
      ref: groupRef(group, size),
      name: commonest(inGroup.map((p) => p.words.slice(0, group.length).map((w) => w.raw).join(" ")))!,
      measure,
      size: measure === "unit" ? count : commonest(inGroup.map((p) => p.size!.size))!,
      minPrice: Math.min(...inGroup.map((p) => (measure === "unit" ? p.minPrice : p.minPrice / p.size!.size))),
      refinements: refinementsOf(prefixed.filter((p) => sameMeasure(p.size, size)).map((p) => p.words), group.length),
      codes: inGroup.map((p) => p.code),
    }];
  });
}
