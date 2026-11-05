// The Internal dashboard's reads of Products (routes/internal/): the app's search with each Product's type, every priced
// Product of a type, one Product with its prices and Promotions, and the Product groups with their priced members.
import type { ProductTypeFilter } from "@grocer/shared/product-types";
import type { Db } from "#/db/index.ts";
import { groupMembers, measureOf, soldByOf } from "#/prices/groups.ts";
import { PROMOTION_STATES, promotionStateAt, promotionText, runningPromotions, type PromotionTerms } from "#/prices/promotions.ts";
import { SEARCH_CANDIDATES, searchProducts, withMeasure } from "#/prices/search.ts";

type Product = { code: string; name: string; manufacturer: string | null; unitQty: string | null; isWeighted: number; productType: string | null };


// Mirrors the search's columns; the price lookups are per Product, like the search's.
const BY_TYPE = `SELECT code, name, manufacturer, unit_qty AS unitQty, is_weighted AS isWeighted, product_type AS productType,
     (SELECT count(*) FROM prices pr WHERE pr.code = p.code) AS storeCount, (SELECT min(price) FROM prices pr WHERE pr.code = p.code) AS minPrice
   FROM products p WHERE product_type IS @type AND storeCount > 0 ORDER BY storeCount DESC, code LIMIT @limit OFFSET @offset`;
// shortcut: a typed search filters the search's first SEARCH_CANDIDATES Products; raise that cap when a type misses some.

/**
 * One page of the Products the app's search finds for `q` (its Products, not its Product groups), each with its type,
 * only those of `type` when given. Without `q`, every priced Product of `type`, most widely priced first.
 */
export function findProducts(db: Db, { q, type, page, pageSize }: { q?: string; type?: ProductTypeFilter; page: number; pageSize: number }) {
  const wanted = type === "none" ? null : type;
  if (q === undefined) {
    const rows = db.$client.prepare(BY_TYPE).all({ type: wanted ?? null, limit: pageSize + 1, offset: (page - 1) * pageSize }) as (Product & { storeCount: number; minPrice: number })[];
    return { products: rows.slice(0, pageSize).map(withMeasure), hasMore: rows.length > pageSize };
  }
  const searched = searchProducts(db, q, type ? SEARCH_CANDIDATES : page * pageSize + 1).filter((r) => r.kind === "product");
  const types = new Map(
    (db.$client.prepare("SELECT code, product_type AS t FROM products WHERE code IN (SELECT value FROM json_each(?))").all(JSON.stringify(searched.map((p) => p.code))) as { code: string; t: string | null }[]).map((r) => [r.code, r.t]),
  );
  const found = searched.map(({ kind: _, ...p }) => ({ ...p, productType: types.get(p.code) ?? null })).filter((p) => !type || p.productType === wanted);
  return { products: found.slice((page - 1) * pageSize, page * pageSize), hasMore: found.length > page * pageSize };
}

type PriceRow = { storeId: string; storeName: string; city: string; chainId: string; chainName: string; chainNameHe: string; price: number; updatedAt: number };

type PromotionRow = PromotionTerms & {
  promotionDbId: number; storeId: string; storeName: string; chainName: string; startsAt: number; endsAt: number; days: string | null;
};
// Every Promotion on the Product at a store that prices it, with that store's Shelf price for its text.
const PROMOTIONS = `SELECT p.id AS promotionDbId, p.promotion_id AS id, p.store_id AS storeId, s.name AS storeName, ch.name AS chainName,
     p.description, p.kind, p.min_qty AS minQty, p.amount, p.audience, p.limit_qty AS limitQty, p.min_purchase AS minPurchase,
     p.starts_at AS startsAt, p.ends_at AS endsAt, p.days, pr.price
   FROM promotion_items pi JOIN promotions p ON p.id = pi.promotion_id JOIN prices pr ON pr.code = pi.code AND pr.store_id = p.store_id
     JOIN stores s ON s.id = p.store_id JOIN chains ch ON ch.id = s.chain_id
   WHERE pi.code = ? ORDER BY p.starts_at DESC, p.id`;

/**
 * One Product, its Shelf price at every store that prices it (cheapest first) with the Promotions running there now,
 * and every Promotion on it at those stores marked by state, running first; null for none.
 */
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
  const state = promotionStateAt(now);
  const weighted = p.isWeighted ? 1 : 0;
  const promotions = (sqlite.prepare(PROMOTIONS).all(code) as (PromotionRow & { price: number })[])
    .map(({ promotionDbId, id, price, startsAt, endsAt, ...promo }) => {
      const dates = { startsAt: new Date(startsAt), endsAt: new Date(endsAt) };
      return {
        id: promotionDbId, promotionId: id, storeId: promo.storeId, storeName: promo.storeName, chainName: promo.chainName, description: promo.description,
        kind: promo.kind, audience: promo.audience, ...dates, days: promo.days, state: state({ ...dates, days: promo.days }),
        text: promotionText({ ...promo, id, weighted }, price),
      };
    })
    .sort((a, b) => PROMOTION_STATES.indexOf(a.state) - PROMOTION_STATES.indexOf(b.state));
  return {
    product: withMeasure(p),
    prices: rows.map((r) => ({
      ...r,
      updatedAt: new Date(r.updatedAt).toISOString(),
      promotions: (running.get(`${r.storeId} ${code}`) ?? []).map(({ storeId: _s, code: _c, weighted: _w, ...promo }) => ({
        ...promo,
        text: promotionText({ ...promo, weighted }, r.price),
      })),
    })),
    promotions,
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
