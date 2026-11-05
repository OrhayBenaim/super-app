// Browse's copy of the price data in SQLite (db/appSchema.ts): ingest packs a store's prices and Promotions into its
// store_browse row in the transaction that writes them, and each Price sync stores every Product's group card
// (browse-groups.ts). A Home or Promotions request reads the nearby stores' packed rows, a few hundred, instead of every
// nearby price row, and adds them up in a loop. Search and Compare read prices and promotions directly.
import { createHash } from "node:crypto";
import type { Db } from "#/db/index.ts";
import type { PromotionTerms } from "#/prices/promotions.ts";
import { runningAt } from "#/prices/promotions.ts";

type Sqlite = Db["$client"];

export const pack = (a: Int32Array | Float64Array | Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const none = () => Buffer.alloc(0);
// A typed array needs an aligned offset; a small Buffer may sit at any offset of a shared pool.
export const i32 = (b: Buffer) => (b.byteOffset % 4 ? new Int32Array(Uint8Array.from(b).buffer) : new Int32Array(b.buffer, b.byteOffset, b.length / 4));
export const f64 = (b: Buffer) => (b.byteOffset % 8 ? new Float64Array(Uint8Array.from(b).buffer) : new Float64Array(b.buffer, b.byteOffset, b.length / 8));
const u8 = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.length);

/** Packs the store's rows in `prices` into its store_browse row. Call inside the transaction that wrote them. */
export function packStorePrices(sqlite: Sqlite, storeId: string) {
  sqlite.prepare("INSERT OR IGNORE INTO browse_products (code) SELECT code FROM prices WHERE store_id = ?").run(storeId);
  const rows = sqlite
    .prepare("SELECT b.id, p.price FROM prices p JOIN browse_products b ON b.code = p.code WHERE p.store_id = ? ORDER BY b.id")
    .raw()
    .all(storeId) as [number, number][];
  sqlite
    .prepare(
      `INSERT INTO store_browse (store_id, products, prices, offer_products, offer_promotions) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(store_id) DO UPDATE SET products = excluded.products, prices = excluded.prices`,
    )
    .run(storeId, pack(Int32Array.from(rows, (r) => r[0])), pack(Float64Array.from(rows, (r) => r[1])), none(), none());
}

const TERMS = "promotion_id, description, kind, min_qty, amount, audience, starts_at, ends_at, days, limit_qty, min_purchase";

/**
 * Packs the store's rows in `promotions` into its store_browse row: each (Product, Promotion) it runs, the Promotion as its
 * Chain's row in chain_promotions (shared by the Chain's stores that publish the same PromotionID and terms). Call inside
 * the transaction that wrote them.
 */
export function packStorePromotions(sqlite: Sqlite, storeId: string) {
  const chainId = sqlite.prepare("SELECT chain_id FROM stores WHERE id = ?").pluck().get(storeId) as string;
  sqlite
    .prepare("INSERT OR IGNORE INTO browse_products (code) SELECT pi.code FROM promotion_items pi JOIN promotions p ON p.id = pi.promotion_id WHERE p.store_id = ?")
    .run(storeId);
  const upsert = sqlite
    .prepare(`INSERT INTO chain_promotions (key, chain_id, ${TERMS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET key = excluded.key RETURNING id`)
    .pluck();
  const chainRow = new Map(
    (sqlite.prepare(`SELECT id, ${TERMS} FROM promotions WHERE store_id = ?`).raw().all(storeId) as unknown[][]).map(([id, ...terms]) => {
      const key = createHash("sha256").update(JSON.stringify([chainId, ...terms])).digest("base64");
      return [id as number, upsert.get(key, chainId, ...terms) as number];
    }),
  );
  const offers = sqlite
    .prepare("SELECT b.id, pi.promotion_id FROM promotion_items pi JOIN promotions p ON p.id = pi.promotion_id JOIN browse_products b ON b.code = pi.code WHERE p.store_id = ? ORDER BY b.id, pi.promotion_id")
    .raw()
    .all(storeId) as [number, number][];
  sqlite
    .prepare(
      `INSERT INTO store_browse (store_id, products, prices, offer_products, offer_promotions) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(store_id) DO UPDATE SET offer_products = excluded.offer_products, offer_promotions = excluded.offer_promotions`,
    )
    .run(storeId, none(), none(), pack(Int32Array.from(offers, (o) => o[0])), pack(Int32Array.from(offers, (o) => chainRow.get(o[1])!)));
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Packs every store with prices or Promotions but no store_browse row (data from before browse's copy), a store per transaction. */
export async function packMissingStores(db: Db) {
  const sqlite = db.$client;
  const missing = sqlite
    .prepare(
      `SELECT id FROM stores WHERE id NOT IN (SELECT store_id FROM store_browse)
         AND (EXISTS (SELECT 1 FROM prices WHERE store_id = stores.id) OR EXISTS (SELECT 1 FROM promotions WHERE store_id = stores.id))`,
    )
    .pluck()
    .all() as string[];
  for (const id of missing) {
    sqlite.transaction(() => {
      packStorePrices(sqlite, id);
      packStorePromotions(sqlite, id);
    })();
    await tick(); // user requests don't wait behind the whole backfill
  }
}

/** Deletes the chain_promotions no store runs any more. */
export function prunePromotions(sqlite: Sqlite) {
  const listed = new Set<number>();
  for (const b of sqlite.prepare("SELECT offer_promotions FROM store_browse").pluck().iterate() as Iterable<Buffer>) for (const id of i32(b)) listed.add(id);
  const gone = (sqlite.prepare("SELECT id FROM chain_promotions").pluck().all() as number[]).filter((id) => !listed.has(id));
  sqlite.prepare("DELETE FROM chain_promotions WHERE id IN (SELECT value FROM json_each(?))").run(JSON.stringify(gone));
}

/** db/appSchema.ts browseCatalog, browseGroupData and browseNames, read: per Product (browse_products id) and per group. Empty before the first grouping. */
export type Catalog = {
  groups: Int32Array; perUnit: Float64Array; weighted: Uint8Array; stores: Int32Array; groupTypes: Uint8Array; groupStores: Int32Array;
  names: Buffer; nameEnds: Int32Array;
};

export function catalog(db: Db): Catalog {
  const row = db.$client.prepare("SELECT groups, per_unit, weighted, stores, group_types, group_stores, names, name_ends FROM browse_catalog JOIN browse_group_data USING (id) JOIN browse_names USING (id) WHERE id = 1").raw().get() as Buffer[] | undefined;
  if (!row) {
    return { groups: new Int32Array(), perUnit: new Float64Array(), weighted: new Uint8Array(), stores: new Int32Array(), groupTypes: new Uint8Array(), groupStores: new Int32Array(), names: none(), nameEnds: new Int32Array() };
  }
  const [groups, perUnit, weighted, stores, groupTypes, groupStores, names, nameEnds] = row as [Buffer, Buffer, Buffer, Buffer, Buffer, Buffer, Buffer, Buffer];
  return { groups: i32(groups), perUnit: f64(perUnit), weighted: u8(weighted), stores: i32(stores), groupTypes: u8(groupTypes), groupStores: i32(groupStores), names, nameEnds: i32(nameEnds) };
}

/** A grouped Product's code and lead words (normalized and as written, space-separated), from the catalog. */
export function nameOf(c: Catalog, k: number) {
  const [code, lead, leadRaw] = c.names.toString("utf8", k ? c.nameEnds[k - 1] : 0, c.nameEnds[k]).split("\t") as [string, string, string];
  return { code, lead, leadRaw };
}

/** Writes the catalog, `names` (per Product, as nameOf reads them: an ungrouped one has none) packed into one blob. */
export function writeCatalog(sqlite: Sqlite, c: Omit<Catalog, "names" | "nameEnds">, names: string[]) {
  const bytes = names.map((s) => Buffer.from(s));
  let end = 0;
  const nameEnds = Int32Array.from(bytes, (b) => (end += b.length));
  sqlite.prepare("INSERT OR REPLACE INTO browse_catalog (id, groups, per_unit, weighted, stores) VALUES (1, ?, ?, ?, ?)").run(pack(c.groups), pack(c.perUnit), pack(c.weighted), pack(c.stores));
  sqlite.prepare("INSERT OR REPLACE INTO browse_group_data (id, group_types, group_stores) VALUES (1, ?, ?)").run(pack(c.groupTypes), pack(c.groupStores));
  sqlite.prepare("INSERT OR REPLACE INTO browse_names (id, names, name_ends) VALUES (1, ?, ?)").run(Buffer.concat(bytes), pack(nameEnds));
}

/**
 * A store's packed row: `products[i]` (browse_products ids, ascending) costs `prices[i]`; it runs Promotion
 * `offerPromotions[j]` (chain_promotions id) on `offerProducts[j]` (ascending). Without `offers`, those are empty.
 */
export type StoreData = { id: string; chainId: string; products: Int32Array; prices: Float64Array; offerProducts: Int32Array; offerPromotions: Int32Array };

export function storeData(db: Db, storeIds: string[], offers = false): StoreData[] {
  const rows = db.$client
    .prepare(
      `SELECT b.store_id, s.chain_id, b.products, b.prices, ${offers ? "b.offer_products, b.offer_promotions" : "NULL, NULL"}
       FROM store_browse b JOIN stores s ON s.id = b.store_id WHERE b.store_id IN (SELECT value FROM json_each(?))`,
    )
    .raw()
    .all(JSON.stringify(storeIds)) as [string, string, Buffer, Buffer, Buffer | null, Buffer | null][];
  return rows.map(([id, chainId, products, prices, offerProducts, offerPromotions]) => ({
    id, chainId, products: i32(products), prices: f64(prices),
    offerProducts: offerProducts ? i32(offerProducts) : new Int32Array(), offerPromotions: offerPromotions ? i32(offerPromotions) : new Int32Array(),
  }));
}

/** One of a Chain's Promotions (`rowid`: its chain_promotions id), without its PromotionID and description (promotionStrings). */
export type StorePromotion = Omit<PromotionTerms, "weighted" | "id" | "description"> & { rowid: number };

/** Those of these chain_promotions that run at `now`, by id. */
export function runningPromotionsOf(db: Db, rowids: Iterable<number>, now: Date) {
  const t = now.getTime();
  const rows = db.$client
    .prepare(
      `SELECT id AS rowid, kind, min_qty AS minQty, amount, audience, limit_qty AS limitQty, min_purchase AS minPurchase, starts_at AS startsAt, ends_at AS endsAt, days
       FROM chain_promotions WHERE id IN (SELECT value FROM json_each(?)) AND starts_at <= ? AND ends_at > ?`,
    )
    .all(JSON.stringify([...rowids]), t, t) as (StorePromotion & { startsAt: number; endsAt: number; days: string | null })[];
  const running = runningAt(now);
  return new Map(rows.filter(running).map(({ startsAt, endsAt, days, ...p }): [number, StorePromotion] => [p.rowid, p]));
}

/** The PromotionID and description of these chain_promotions, by id. */
export const promotionStrings = (db: Db, rowids: number[]) =>
  new Map(
    (db.$client.prepare("SELECT id, promotion_id, description FROM chain_promotions WHERE id IN (SELECT value FROM json_each(?))").raw().all(JSON.stringify([...new Set(rowids)])) as [number, string, string][]).map(
      ([rowid, id, description]) => [rowid, { id, description }],
    ),
  );
