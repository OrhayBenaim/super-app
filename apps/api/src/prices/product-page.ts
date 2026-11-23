// A Product page: one Product's price at each store, as Compare prices a List of that one Product at Quantity 1.
import type { SoldBy } from "@grocer/shared/quantity";
import type { Db } from "#/db/index.ts";
import { measureOf, soldByOf, type Measure } from "#/prices/groups.ts";
import { nearbyStores, type Near } from "#/prices/nearby.ts";
import { priceLines, round2, runningPromotions } from "#/prices/promotions.ts";

type StoreRow = { storeId: string; chainName: string; storeName: string; lat: number | null; lng: number | null; price: number };

/**
 * The Product `code` and its price per store, cheapest first (the Promotion price when one runs and lowers it), nearer
 * first on a tie. With `near`: the stores within its radius, each with its distance; without: every store that prices it.
 * Null when no store prices the code. A Product sold by weight is priced per kilo, as its stores publish it.
 */
export function productPage(db: Db, code: string, near: Near | null, now: Date) {
  const product = db.$client
    .prepare("SELECT code, name, unit_qty AS unitQty, is_weighted AS isWeighted, product_type AS type FROM products WHERE code = ? AND EXISTS (SELECT 1 FROM prices WHERE code = products.code)")
    .get(code) as { code: string; name: string; unitQty: string | null; isWeighted: number; type: string | null } | undefined;
  if (!product) return null;
  const nearby = near && new Map(nearbyStores(db, near).map((s) => [s.id, s.km]));
  const rows = db.$client
    .prepare(
      `SELECT s.id AS storeId, ch.name AS chainName, s.name AS storeName, s.lat, s.lng, pr.price
       FROM prices pr JOIN stores s ON s.id = pr.store_id JOIN chains ch ON ch.id = s.chain_id
       WHERE pr.code = ? AND (? IS NULL OR pr.store_id IN (SELECT value FROM json_each(?)))`,
    )
    .all(code, nearby ? 1 : null, JSON.stringify([...(nearby?.keys() ?? [])])) as StoreRow[];
  const promos = runningPromotions(db, rows.map((r) => r.storeId), [code], now);
  const stores = rows
    .map(({ storeId, price, ...store }) => {
      const shelf = { code, price, quantity: 1 };
      const line = priceLines([[shelf, ...(promos.get(`${storeId} ${code}`) ?? []).map((promo) => ({ ...shelf, promo }))]]).lines[0]!;
      const promoPrice = line.promotion ? line.lineTotal : null;
      return {
        ...store,
        ...(nearby ? { distanceKm: round2(nearby.get(storeId)!) } : {}),
        price, promoPrice, promoText: line.promotion?.text ?? null,
        cost: promoPrice ?? price,
      };
    })
    .sort((a, b) => a.cost - b.cost || (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .map(({ cost: _, ...s }) => s);
  const sized = measureOf(product);
  const soldBy: SoldBy = soldByOf(product);
  return {
    product: { code, name: product.name, measure: (sized?.measure ?? null) as Measure | null, size: sized?.size ?? null, soldBy, type: product.type ?? "other" },
    stores,
  };
}
