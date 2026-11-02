// Product groups (CONTEXT.md, docs/adr/0001): products that are one thing to a shopper, worked out from their names at
// query time and never stored. A group is named by its "group ref": normalized words + measure (+ the pack count when
// counted by the unit), e.g. "בורגול|kg", "ביצ|unit|12".

/** Words that never tell two products apart: origin, grade, "by weight", "loose" (loose is the default). */
const NOISE = new Set(["במשקל", "משקל", "שקיל", "תפזורת", "בתפזורת", "ישראל", "ישראלי", "ישראלית", "מובחר", "מובחרת", "מובחרים", "טרי", "טריה", "טריים", "לקג"]);
/** Words that mark a bag, net or pack: those stay a separate product from loose. */
const PACKED = new Set(["ארוז", "ארוזה", "ארוזים", "ארוזות", "בשקית", "ברשת", "מארז"]);
/** Skipped at the start of a name, so "גבינת קוטג" is cottage cheese. */
const LEADING = new Set(["גבינת", "גבינה"]);
/** A dish ("עם"), a substitute, organic: a product with one (or packed) is only in a group whose words have it too. */
const QUALIFIERS: [RegExp, string][] = [
  [/^עם$/, "עם"], [/^טבעונ/, "טבעוני"], [/^צמחי/, "צמחי"], [/^קוקוס$/, "קוקוס"], [/^שקד/, "שקד"], [/^סויה$/, "סויה"],
  [/^שיבולת$/, "שיבולת"], [/^אורגנ/, "אורגני"],
];
const QUALIFIER = new Set(["ארוז", ...QUALIFIERS.map(([, w]) => w)]);

const WEIGHT: Record<string, number> = { גרם: 0.001, גרמים: 0.001, גר: 0.001, ג: 0.001, קג: 1, קילו: 1, קילוגרם: 1, קילוגרמים: 1 };
const VOLUME: Record<string, number> = { מל: 0.001, מיליליטר: 0.001, ל: 1, ליטר: 1, ליטרים: 1 };
const COUNT = new Set(["יח", "יחי", "יחידה", "יחידות"]);
const EGG_SIZE = /^(s|m|l|xl)$/i;
const isNumber = (w: string) => /^\d/.test(w);
/** Numbers and units: never a group word or a refinement. */
const isSizeWord = (w: string) => isNumber(w) || w in WEIGHT || w in VOLUME || COUNT.has(w);

/** Letter runs and numbers: splits at spaces, punctuation, % and digit/letter boundaries ("קוטג%5מהדרין250גר"). */
const rawWords = (s: string) =>
  s.replace(/ק["״]ג/g, "קג").replace(/מ["״]ל/g, "מל").replace(/תפו["״]א/g, "תפוח אדמה").match(/\d+(?:\.\d+)?|\p{L}+/gu) ?? [];

/** Spelling and plural forms of one word: עגבנייה, עגבנית, עגבניות -> עגבניה; בננות -> בננה; מלפפונים -> מלפפון. */
export const stem = (w: string) => {
  const s = w.replace(/יי/g, "י");
  return s.length < 4 ? s : s.replace(/ות$/, "ה").replace(/ים$/, "").replace(/ית$/, "יה");
};

export type Word = { raw: string; norm: string };

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

/** FTS5 prefix terms that find every product a group of these words can hold ("בננה" -> "בננ"* also finds בננות). */
export const ftsMatch = (words: string[]) =>
  words
    .filter((w) => w !== "ארוז") // packed is also בשקית, ברשת...
    .map((w) => `"${w.length >= 4 ? w.replace(/י?ה$/, "") : w}"*`)
    .join(" ");

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

/** True when a name with these words starts with the group's words and has no qualifier the group's words lack. */
export const startsGroup = (words: Word[], group: string[]) =>
  group.every((w, i) => words[i]?.norm === w) && words.every((w) => !QUALIFIER.has(w.norm) || group.includes(w.norm));

/** Same measure, and for the unit the same pack count. */
export const sameMeasure = (a: Size | null, b: Size) => !!a && a.measure === b.measure && (b.measure !== "unit" || a.size === b.size);

export const groupRef = (words: string[], { measure, size }: Size) => [words.join(" "), measure, ...(measure === "unit" ? [size] : [])].join("|");

/** A group ref's words and measure, or null when it is not one. A kilo or liter group's size is always 1. */
export function parseRef(ref: string): { words: string[]; size: Size } | null {
  const [words = "", measure, count, ...rest] = ref.split("|");
  const size = measure === "unit" ? Number(count) : 1;
  if (!words.trim() || rest.length || !["kg", "l", "unit"].includes(measure!) || !Number.isInteger(size) || size < 1) return null;
  if (measure !== "unit" && count !== undefined) return null;
  return { words: words.split(" "), size: { measure: measure as Measure, size } };
}

/** The group named by a product's own normalized name, sizes dropped: where a former Produce-group item moves to. */
export function ownGroupRef(p: Sized) {
  const words = nameWords(p.name).map((w) => w.norm).filter((w) => !isSizeWord(w));
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

export type Candidate = Sized & { code: string; minPrice: number };
export type FoundGroup = { ref: string; name: string; measure: Measure; size: number; minPrice: number; refinements: string[]; codes: string[] };

/**
 * The groups a search for `q` shows, from its candidate products: products whose names start with the query's words,
 * measured the way most of them are, one group per pack count when counted by the unit, each with 2+ products.
 * Refinements are the commonest next words among them, qualifiers such as "אורגני" included.
 */
export function searchGroups(q: string, candidates: Candidate[]): FoundGroup[] {
  const group = nameWords(q).map((w) => w.norm);
  if (!group.length) return [];
  const k = group.length;
  const prefixed = candidates
    .map((p) => ({ ...p, words: nameWords(p.name), size: measureOf(p) }))
    .filter((p) => p.size && group.every((w, i) => p.words[i]?.norm === w));
  const members = prefixed.filter((p) => startsGroup(p.words, group));
  const measure = commonest(members.map((p) => p.size!.measure));
  if (!measure) return [];
  const counts = measure === "unit" ? [...new Set(members.filter((p) => p.size!.measure === "unit").map((p) => p.size!.size))] : [1];
  return counts.flatMap((count) => {
    const size: Size = { measure, size: count };
    const inIt = members.filter((p) => sameMeasure(p.size, size));
    if (inIt.length < 2) return [];
    const next = prefixed.flatMap((p) => {
      const w = p.words[k];
      return w && sameMeasure(p.size, size) && !isSizeWord(w.norm) && w.norm !== "עם" ? [w] : [];
    });
    const tally = new Map<string, number>();
    for (const w of next) tally.set(w.norm, (tally.get(w.norm) ?? 0) + 1);
    const refinements = [...tally]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([norm]) => commonest(next.filter((w) => w.norm === norm).map((w) => w.raw))!);
    const perUnit = (p: (typeof inIt)[number]) => (measure === "unit" ? p.minPrice : p.minPrice / p.size!.size);
    return [{
      ref: groupRef(group, size),
      name: commonest(inIt.map((p) => p.words.slice(0, k).map((w) => w.raw).join(" ")))!,
      measure,
      size: measure === "unit" ? count : commonest(inIt.map((p) => p.size!.size))!,
      minPrice: Math.round(Math.min(...inIt.map(perUnit)) * 100) / 100,
      refinements,
      codes: inIt.map((p) => p.code),
    }];
  });
}
