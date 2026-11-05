// Browse's copy of the price data in memory: the Products, and per store its prices and Promotions as arrays. Home and
// Promotions then add up the nearby prices in a loop, where SQL took seconds to group a city's ~1.5M price rows. A store
// loads on first use. When a Price sync records a Chain or finishes (Product types come last), a new copy loads in the
// background, a store at a time, while requests keep the old one: browse lags a running sync by about one Chain, and no
// request waits for a reload. Search and Compare still read SQLite.
// shortcut: writes made outside a Price sync (the one-off ingest job) reach browse only after an API restart.
import type { ProductType } from "@grocer/shared/product-types";
import type { Db } from "#/db/index.ts";
import type { PromotionTerms } from "#/prices/promotions.ts";

export type Product = { code: string; name: string; unitQty: string | null; isWeighted: number; type: ProductType };
/** A store's prices: `products[i]` (an index into `PriceIndex.products`) costs `prices[i]`. */
export type StorePrices = { products: Int32Array; prices: Float64Array };
/** One of a store's Promotions and the Products it covers (indexes into `PriceIndex.products`). */
export type StorePromotion = Omit<PromotionTerms, "weighted"> & { startsAt: number; endsAt: number; days: string | null; products: Int32Array };

const TERMS = ["kind", "description", "minQty", "amount", "audience", "limitQty", "minPurchase", "startsAt", "endsAt", "days"] as const;

const VERSION = `SELECT coalesce((SELECT max(rowid) FROM sync_chain_results), 0) || ' ' || coalesce((SELECT max(finished_at) FROM sync_runs), 0) AS v`;

function load(db: Db) {
  const sqlite = db.$client;
  // In code order, as GROUP BY returned them, so ties keep their order.
  const products = sqlite
    .prepare("SELECT code, name, unit_qty AS unitQty, is_weighted AS isWeighted, coalesce(product_type, 'other') AS type FROM products ORDER BY code")
    .all() as Product[];
  const byCode = new Map(products.map((p, i) => [p.code, i]));
  const chains = new Map(sqlite.prepare("SELECT id, chain_id FROM stores").raw().all() as [string, string][]);
  // A store new since this loaded is still known: ids are `${chainId}-${storeId}`.
  const chainOf = (store: string) => chains.get(store) ?? store.slice(0, store.indexOf("-"));
  const pricesOf = sqlite.prepare("SELECT code, price FROM prices WHERE store_id = ?").raw();
  const promotionsOf = sqlite.prepare(
    `SELECT id AS rowid, promotion_id AS id, kind, description, min_qty AS minQty, amount, audience, limit_qty AS limitQty,
       min_purchase AS minPurchase, starts_at AS startsAt, ends_at AS endsAt, days FROM promotions WHERE store_id = ?`,
  );
  const itemsOf = sqlite.prepare("SELECT pi.promotion_id, pi.code FROM promotion_items pi JOIN promotions p ON p.id = pi.promotion_id WHERE p.store_id = ?").raw();
  const prices = new Map<string, StorePrices>();
  const promotions = new Map<string, StorePromotion[]>();
  /** Indexes of the codes we have a Product for, in order (a new Product shows once its Chain is recorded). */
  const indexes = (codes: string[]) => Int32Array.from(codes.flatMap((c) => byCode.get(c) ?? [])).sort();
  // A Chain runs most Promotions at many of its stores: each is kept once, by Chain and PromotionID.
  const shared = new Map<string, StorePromotion[]>();
  const intern = (chainId: string, p: StorePromotion) => {
    const same = shared.get(`${chainId} ${p.id}`) ?? shared.set(`${chainId} ${p.id}`, []).get(`${chainId} ${p.id}`)!;
    const found = same.find((q) => TERMS.every((k) => q[k] === p[k]) && q.products.length === p.products.length && q.products.every((v, i) => v === p.products[i]));
    if (found) return found;
    same.push(p);
    return p;
  };
  return {
    products,
    byCode,
    /** The stores whose prices, and whose Promotions, are loaded. */
    loaded: () => ({ prices: [...prices.keys()], promotions: [...promotions.keys()] }),
    /** Every store, for browse without a location. */
    storeIds: [...chains.keys()],
    chainOf,
    prices(store: string) {
      let s = prices.get(store);
      if (!s) {
        const rows = (pricesOf.all(store) as [string, number][]).filter(([code]) => byCode.has(code));
        s = { products: Int32Array.from(rows, ([code]) => byCode.get(code)!), prices: Float64Array.from(rows, ([, price]) => price) };
        prices.set(store, s);
      }
      return s;
    },
    promotions(store: string) {
      let s = promotions.get(store);
      if (!s) {
        const codes = new Map<number, string[]>();
        for (const [id, code] of itemsOf.all(store) as [number, string][]) (codes.get(id) ?? codes.set(id, []).get(id)!).push(code);
        const chainId = chainOf(store);
        s = (promotionsOf.all(store) as (Omit<StorePromotion, "products"> & { rowid: number })[]).map(({ rowid, ...p }) =>
          intern(chainId, { ...p, products: indexes(codes.get(rowid) ?? []) }),
        );
        promotions.set(store, s);
      }
      return s;
    },
  };
}

export type PriceIndex = ReturnType<typeof load>;

const indexes = new WeakMap<Db, { version: string; index: PriceIndex; reloading?: boolean }>();

/**
 * The price index for `db`. The first call loads it; after a Price sync recorded a Chain or finished, calls keep getting
 * the old one until its replacement has loaded the same stores.
 */
export function priceIndex(db: Db): PriceIndex {
  const { v: version } = db.$client.prepare(VERSION).get() as { v: string };
  const entry = indexes.get(db);
  if (!entry) {
    const index = load(db);
    indexes.set(db, { version, index });
    return index;
  }
  if (entry.version !== version && !entry.reloading) {
    entry.reloading = true;
    reload(db, entry.index).then(
      (index) => indexes.set(db, { version, index }),
      (e: unknown) => {
        entry.reloading = false; // the next request tries again
        console.error("price index: reload failed", e);
      },
    );
  }
  return entry.index;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** A new index with the stores `old` has loaded, one store per turn of the event loop so requests run in between. */
async function reload(db: Db, old: PriceIndex) {
  await tick(); // not inside the request that noticed the new version
  const index = load(db);
  const { prices, promotions } = old.loaded();
  for (const id of prices) await tick().then(() => index.prices(id));
  for (const id of promotions) await tick().then(() => index.promotions(id));
  return index;
}
