// The Internal dashboard's reads of Products (routes/internal/): the app's search with each Product's type, every priced
// Product of a type, one Product with its prices and Promotions, and the Product groups with their priced members.
import type { ProductType } from "@grocer/shared/product-types";
import type { Db } from "#/db/index.ts";
import { groupMembers, measureOf, soldByOf } from "#/prices/groups.ts";
import { promotionText, runningPromotions } from "#/prices/promotions.ts";
import { searchProducts } from "#/prices/search.ts";

/** A Product type, or "none" for Products with none yet. */
export type TypeFilter = ProductType | "none";

type Product = { code: string; name: string; manufacturer: string | null; unitQty: string | null; isWeighted: number; productType: string | null };

/** The Product as the search returns one: its measure and size (null when its name gives none) and how it is sold. */
const asFound = <P extends Product>({ isWeighted, ...p }: P) => ({ ...p, ...(measureOf({ ...p, isWeighted }) ?? { measure: null, size: null }), soldBy: soldByOf({ ...p, isWeighted }) });

// Mirrors the search's columns; the price lookups are per Product, like the search's.
const BY_TYPE = `SELECT code, name, manufacturer, unit_qty AS unitQty, is_weighted AS isWeighted, product_type AS productType,
     (SELECT count(*) FROM prices pr WHERE pr.code = p.code) AS storeCount, (SELECT min(price) FROM prices pr WHERE pr.code = p.code) AS minPrice
   FROM products p WHERE product_type IS @type AND storeCount > 0 ORDER BY storeCount DESC, code LIMIT @limit OFFSET @offset`;
// shortcut: a typed search filters the search's first 3000 Products (its own candidate cap); raise both together.
const TYPED_SEARCH_LIMIT = 3000;

/**
 * One page of the Products the app's search finds for `q` (its Products, not its Product groups), each with its type,
 * only those of `type` when given. Without `q`, every priced Product of `type`, most widely priced first.
 */
export function findProducts(db: Db, { q, type, page, pageSize }: { q?: string; type?: TypeFilter; page: number; pageSize: number }) {
  const wanted = type === "none" ? null : type;
  if (q === undefined) {
    const rows = db.$client.prepare(BY_TYPE).all({ type: wanted ?? null, limit: pageSize + 1, offset: (page - 1) * pageSize }) as (Product & { storeCount: number; minPrice: number })[];
    return { products: rows.slice(0, pageSize).map(asFound), hasMore: rows.length > pageSize };
  }
  const searched = searchProducts(db, q, type ? TYPED_SEARCH_LIMIT : page * pageSize + 1).filter((r) => r.kind === "product");
  const types = new Map(
    (db.$client.prepare("SELECT code, product_type AS t FROM products WHERE code IN (SELECT value FROM json_each(?))").all(JSON.stringify(searched.map((p) => p.code))) as { code: string; t: string | null }[]).map((r) => [r.code, r.t]),
  );
  const found = searched.map(({ kind: _, ...p }) => ({ ...p, productType: types.get(p.code) ?? null })).filter((p) => !type || p.productType === wanted);
  return { products: found.slice((page - 1) * pageSize, page * pageSize), hasMore: found.length > page * pageSize };
}

type PriceRow = { storeId: string; storeName: string; city: string; chainId: string; chainName: string; chainNameHe: string; price: number; updatedAt: number };

/** One Product, its Shelf price at every store that prices it (cheapest first) and the Promotions running there now; null for none. */
export function productDetail(db: Db, code: string, now: Date) {
  const sqlite = db.$client;
  const p = sqlite
    .prepare("SELECT code, name, manufacturer, unit_qty AS unitQty, is_weighted AS isWeighted, product_type AS productType FROM products WHERE code = ?")
    .get(code) as Product | undefined;
  if (!p) return null;
  const rows = sqlite
    .prepare(
      `SELECT s.id AS storeId, s.name AS storeName, s.city, ch.id AS chainId, ch.name AS chainName, ch.name_he AS chainNameHe, pr.price, pr.updated_at AS updatedAt
       FROM prices pr JOIN stores s ON s.id = pr.store_id JOIN chains ch ON ch.id = s.chain_id
       WHERE pr.code = ? ORDER BY pr.price, ch.name, s.name`,
    )
    .all(code) as PriceRow[];
  const running = runningPromotions(db, rows.map((r) => r.storeId), [code], now);
  return {
    product: asFound(p),
    prices: rows.map((r) => ({
      ...r,
      updatedAt: new Date(r.updatedAt).toISOString(),
      promotions: (running.get(`${r.storeId} ${code}`) ?? []).map(({ storeId: _s, code: _c, weighted: _w, ...promo }) => ({
        ...promo,
        text: promotionText({ ...promo, weighted: p.isWeighted ? 1 : 0 }, r.price),
      })),
    })),
  };
}

/**
 * The Product groups the app's search finds for `words`, each with its members (the Products Compare picks from) that
 * some store prices, cheapest per kilo or liter (per pack for a unit group) first.
 */
export function groupsWithMembers(db: Db, words: string) {
  const priced = db.$client.prepare("SELECT min(price) AS minPrice, count(*) AS storeCount FROM prices WHERE code = ?");
  return searchProducts(db, words, 0).flatMap((found) => {
    if (found.kind !== "group") return [];
    const { kind: _, ...g } = found;
    const members = groupMembers(db, g.ref).members.flatMap((p) => {
      const { minPrice, storeCount } = priced.get(p.code) as { minPrice: number | null; storeCount: number };
      if (minPrice === null) return [];
      return [{ code: p.code, name: p.name, ...measureOf(p)!, soldBy: soldByOf(p), minPrice, storeCount }];
    });
    const per = (m: (typeof members)[number]) => (g.measure === "unit" ? m.minPrice : m.minPrice / m.size);
    return [{ ...g, members: members.sort((a, b) => per(a) - per(b) || a.name.localeCompare(b.name)) }];
  });
}
