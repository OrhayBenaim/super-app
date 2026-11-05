// Product search (GET /api/products/search, and the Internal dashboard's Products and Product groups): Product groups
// by their words, then Products, from products_fts and the prices index.
import type { Db } from "#/db/index.ts";
import { ftsMatch, measureOf, nameWords, searchGroups, soldByOf, withoutSizes } from "#/prices/groups.ts";
import { round2 } from "#/prices/promotions.ts";

const TOP_CODES = 5;
/** How many Products one search ranks at most (see the shortcut below). */
export const SEARCH_CANDIDATES = 3000;

// minPrice is the lowest price anywhere, or with @store that store's price (null when it does not price the product).
type Found = { code: string; name: string; manufacturer: string | null; unitQty: string | null; isWeighted: number; storeCount: number; minPrice: number | null };
const productCols = `p.code, p.name, p.manufacturer, p.unit_qty AS unitQty, p.is_weighted AS isWeighted`;
// The product named exactly the first word comes first, then products named after the word ("חלב 3%" before "שוקולד
// חלב", both before "חלבה"), then the most widely priced. LIKE matches ASCII case-insensitively, as the FTS tokenizer does.
// Store count and min price are per-product lookups in the covering prices index: a JOIN + GROUP BY over every price
// row was 4x slower. Products no store prices are left out.
// shortcut: candidates are capped at 3000; a group's members rank in the first tiers, so only a bigger group loses some.
// Raise the cap or count members in SQL when one real search hits it. With @store, what it prices ranks first, so the cap
// only drops products it does not price (kept as candidates because groups form from every product).
const FTS_SEARCH = `SELECT ${productCols},
     (SELECT count(*) FROM prices pr WHERE pr.code = p.code) AS storeCount,
     (SELECT min(pr.price) FROM prices pr WHERE pr.code = p.code AND (@store IS NULL OR pr.store_id = @store)) AS minPrice,
     CASE WHEN p.name LIKE @first THEN 0 WHEN p.name LIKE @first || ' %' THEN 1
       WHEN ' ' || p.name || ' ' LIKE '% ' || @first || ' %' THEN 2 ELSE 3 END AS tier
   FROM products_fts f JOIN products p ON p.code = f.code
   WHERE products_fts MATCH @match AND storeCount > 0 ORDER BY minPrice IS NULL, tier, storeCount DESC, f.rank, p.code LIMIT ${SEARCH_CANDIDATES}`;
const CODE_SEARCH = `SELECT ${productCols}, count(pr.store_id) AS storeCount,
     min(CASE WHEN @store IS NULL OR pr.store_id = @store THEN pr.price END) AS minPrice FROM products p JOIN prices pr ON pr.code = p.code
   WHERE p.code = @q OR (p.code LIKE @prefix AND instr(p.code, ':') = 0) GROUP BY p.code HAVING minPrice IS NOT NULL
   ORDER BY p.code = @q DESC, storeCount DESC LIMIT @limit`;
const withPrice = <T extends Found>(rows: T[]) => rows.filter((r): r is T & { minPrice: number } => r.minPrice !== null);

/** A Product as the search returns one: its measure and size (null when its name gives none) and how it is sold. */
export const withMeasure = <P extends { name: string; unitQty: string | null; isWeighted: number }>({ isWeighted, ...p }: P) => ({
  ...p,
  ...(measureOf({ ...p, isWeighted }) ?? { measure: null, size: null }),
  soldBy: soldByOf({ ...p, isWeighted }),
});
const productResult = (p: Found & { minPrice: number }) => ({ kind: "product" as const, ...withMeasure(p) });

/**
 * Product search: the Product groups the query's words name come first (most stores first), then specific products.
 * A barcode (8+ digits) returns products only: the exact code, then code prefixes.
 * With `storeId`, only what that store prices, at its price: a product's own, a group's cheapest product there.
 */
export function searchProducts(db: Db, q: string, limit: number, storeId?: string) {
  const sqlite = db.$client;
  const store = storeId ?? null;
  if (/^\d{8,}$/.test(q)) return withPrice(sqlite.prepare(CODE_SEARCH).all({ q, prefix: `${q}%`, limit, store }) as Found[]).map(productResult);
  // Quoted prefix terms keep AND/OR/NOT/NEAR literal; punctuation never reaches FTS (words are letter runs and numbers).
  const typed = nameWords(q);
  const words = typed.map((w) => w.norm);
  const find = (match: string) => (match ? sqlite.prepare(FTS_SEARCH).all({ match, first: typed[0]!.raw, store }) : []) as (Found & { tier: number })[];
  const found = find(ftsMatch(words));
  // A typed size narrows the products but never the group ("בורגול 500 גרם" names all of "בורגול").
  const groupWords = withoutSizes(words);
  const pool = groupWords.length === words.length ? found : find(ftsMatch(groupWords));
  // Groups form from every candidate; a member the store does not price costs Infinity, so a group with none there drops out.
  const candidateGroups = searchGroups(groupWords, pool.map((p) => ({ ...p, minPrice: p.minPrice ?? Infinity })));
  const groups = candidateGroups.filter((g) => g.minPrice !== Infinity).map(({ codes, minPrice, ...g }) => {
    const { n } = sqlite.prepare("SELECT count(DISTINCT store_id) AS n FROM prices WHERE code IN (SELECT value FROM json_each(?))").get(JSON.stringify(codes)) as { n: number };
    // topCodes: the best-matching members first (search order), for the app to show the first one with an image.
    return { kind: "group" as const, ...g, minPrice: round2(minPrice), productCount: codes.length, storeCount: n, topCodes: codes.slice(0, TOP_CODES) };
  });
  groups.sort((a, b) => b.storeCount - a.storeCount);
  return [...groups, ...withPrice(found).slice(0, limit).map(({ tier: _, ...p }) => productResult(p))];
}
