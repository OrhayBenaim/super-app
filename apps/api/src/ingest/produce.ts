// Produce groups (CONTEXT.md): weighed and barcode-less products have a different code at every chain, so the same
// banana is 15 products. Products whose names normalize to the same key are one product for search and compare.
import { isGtin } from "#/ingest/parse.ts";

/** Words that never tell two products apart: origin, grade, "by weight", "loose" (loose is the default). */
const NOISE = new Set(["במשקל", "משקל", "שקיל", "תפזורת", "בתפזורת", "ישראל", "ישראלי", "ישראלית", "מובחר", "מובחרת", "מובחרים", "טרי", "טריה", "טריים", "לקג"]);
/** Words that mark a bag, net or pack: those stay a separate product from loose. */
const PACKED = new Set(["ארוז", "ארוזה", "ארוזים", "ארוזות", "בשקית", "ברשת", "מארז"]);

const words = (name: string) =>
  name
    .replace(/תפו"א/g, "תפוח אדמה")
    .replace(/[`'"׳״*/\\.,()\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w));

/** Spelling and plural forms of one word: עגבנייה, עגבנית, עגבניות -> עגבניה; בננות -> בננה; מלפפונים -> מלפפון. */
const stem = (w: string) => {
  const s = w.replace(/יי/g, "י");
  return s.length < 4 ? s : s.replace(/ות$/, "ה").replace(/ים$/, "").replace(/ית$/, "יה");
};

/** How the price is meant: per kilo or per unit (the same split as Sold by, issue #49). Never mixed in one group. */
export const soldBy = (isWeighted: boolean, unitQty: string | null) =>
  isWeighted && /(ק"ג|קילו|גרם)/.test(unitQty ?? "") ? "weight" : "unit";

/** The name people should see: "גזר תפזורת" -> "גזר", "בננות ישראל" -> "בננות"; "גזר ארוז" stays. */
export const produceName = (name: string) => words(name).join(" ") || name.trim();

/**
 * Group key for a product that some chain has no global barcode for, or sells by weight; null for barcoded products
 * (their GTIN is already shared by every chain). Packed and loose differ, so do weight and unit.
 */
export function produceKey(p: { code: string; name: string; isWeighted: boolean; unitQty: string | null }) {
  if (!p.isWeighted && isGtin(p.code)) return null;
  const all = words(p.name);
  const packed = all.some((w) => PACKED.has(w));
  const key = [...all.filter((w) => !PACKED.has(w)).map(stem), ...(packed ? ["ארוז"] : [])].join(" ") || p.name.trim();
  return `${key}|${soldBy(p.isWeighted, p.unitQty)}`;
}
