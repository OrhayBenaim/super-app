import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Deps } from "#/deps.ts";
import { chainByKey } from "#/ingest/chains.ts";
import { parseFileName, storeOfFileName } from "#/ingest/files.ts";
import { decodeXml, isGtin, parsePrices, parsePromotions, parseStores } from "#/ingest/parse.ts";

type IngestDeps = Pick<Deps, "db" | "clock">;

function chainFor(key: string, fileChainId: string) {
  const chain = chainByKey(key);
  if (!chain.ids.includes(fileChainId)) throw new Error(`file ChainId ${fileChainId} is not ${key} (${chain.ids.join(", ")})`);
  return chain.ids[0]!;
}

// GS1 barcodes are global; internal and weighed codes mean different things per chain, so they are chain-scoped.
const productCode = (chainId: string, code: string) => (isGtin(code) ? code : `${chainId}:${code}`);

/**
 * The store a price or promotion file is for: its file name wins over the StoreID inside. Null (with a warning) when the
 * store is not in the Chain's Stores file: Shufersal still lists months-old files of closed stores.
 */
function storeOf({ db }: IngestDeps, chainId: string, fileName: string | undefined, insideId: string, what: string) {
  // Carrefour's former Yeinot Bitan stores (files 400-473) carry their old StoreID inside, and 26 of those are other live
  // stores (file 407 says 117); the name matches the Stores file (2026-11-01).
  const storeId = `${chainId}-${(fileName ? storeOfFileName(fileName) : null) ?? insideId}`;
  if (db.$client.prepare("SELECT 1 FROM stores WHERE id = ?").get(storeId)) return storeId;
  console.warn(`store ${storeId} is not in the chain's Stores file; skipped its ${what}`);
  return null;
}

/** Upserts a Stores file. Clears lat/lng of a store whose address changed so geocode picks it up again. */
export function ingestStores({ db }: IngestDeps, chainKey: string, xml: string) {
  const sqlite = db.$client;
  const parsed = parseStores(xml);
  const chainId = chainFor(chainKey, parsed.chainId);
  const upsertStore = sqlite.prepare(
    `INSERT INTO stores (id, chain_id, store_id, sub_chain_id, name, address, city) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET sub_chain_id = excluded.sub_chain_id, name = excluded.name,
       lat = CASE WHEN stores.address = excluded.address AND stores.city = excluded.city THEN stores.lat END,
       lng = CASE WHEN stores.address = excluded.address AND stores.city = excluded.city THEN stores.lng END,
       address = excluded.address, city = excluded.city`,
  );
  sqlite.transaction(() => {
    for (const s of parsed.stores)
      upsertStore.run(`${chainId}-${s.storeId}`, chainId, s.storeId, s.subChainId, s.name, s.address, s.city);
  })();
  return parsed.stores.length;
}

/**
 * Replaces the store's prices with this PriceFull snapshot (items no longer listed are dropped) and skips items priced <= 0.
 * A price update file (named `Price…`) is applied on top instead: its rows replace those products' prices, `ItemStatus` 0
 * removes the product from the store, and absent products keep their price.
 * Pass the file's name: its store wins over the StoreID inside. A store missing from the Stores file is skipped (returns 0).
 */
export function ingestPrices({ db, clock }: IngestDeps, chainKey: string, xml: string, fileName?: string) {
  const sqlite = db.$client;
  const update = parseFileName(basename(fileName ?? ""))?.type === "price";
  const parsed = parsePrices(xml);
  const chainId = chainFor(chainKey, parsed.chainId);
  const storeId = storeOf({ db, clock }, chainId, fileName, parsed.storeId, "prices");
  if (!storeId) return 0;
  const now = clock.now().getTime();
  const valid = parsed.items.filter((it) => it.price > 0 || (update && it.removed)); // also drops NaN
  if (valid.length < parsed.items.length) console.warn(`${storeId}: skipped ${parsed.items.length - valid.length} items with price <= 0`);
  // Real files repeat an ItemCode now and then (Keshet: 7.90 and 8.90 for one code); the last row wins, as the upsert would.
  const items = [...new Map(valid.map((it) => [productCode(chainId, it.code), it])).entries()];
  // First chain to publish a barcode names it; later files only fill blanks (keeps names and FTS rows stable).
  const upsertProduct = sqlite.prepare(
    `INSERT INTO products (code, item_code, name, manufacturer, unit_qty, is_weighted) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET manufacturer = coalesce(products.manufacturer, excluded.manufacturer),
       unit_qty = coalesce(products.unit_qty, excluded.unit_qty)`,
  );
  const upsertPrice = sqlite.prepare(
    `INSERT INTO prices (store_id, code, price, unit_price, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(store_id, code) DO UPDATE SET price = excluded.price, unit_price = excluded.unit_price, updated_at = excluded.updated_at`,
  );
  const removePrice = sqlite.prepare("DELETE FROM prices WHERE store_id = ? AND code = ?");
  sqlite.transaction(() => {
    if (!update) sqlite.prepare("DELETE FROM prices WHERE store_id = ?").run(storeId);
    for (const [code, it] of items) {
      if (update && it.removed) {
        removePrice.run(storeId, code);
        continue;
      }
      upsertProduct.run(code, it.code, it.name, it.manufacturer, it.unitQty, it.isWeighted ? 1 : 0);
      upsertPrice.run(storeId, code, it.price, it.unitPrice, now);
    }
  })();
  return items.length;
}

export type PromotionsOutcome =
  | { layout: "unknown" }
  | { layout: "grouped" | "flat" | "flat-percent"; store: string; loaded: number; unpriced: { promotionId: string; kind: string }[] };

/**
 * Loads a promotion file. A full file (named `PromoFull…`) replaces the store's Promotions, so one it no longer lists has
 * ended; an update (named `Promo…`) replaces only the Promotions it lists, each by its PromotionID. A file in a layout
 * Grocer can't read yet leaves the store's Promotions untouched. Returns the store (the Chain's StoreID), how many were
 * loaded (info-only ones included) and the ones it couldn't price.
 */
export function ingestPromotions(deps: IngestDeps, chainKey: string, xml: string, fileName: string): PromotionsOutcome {
  const sqlite = deps.db.$client;
  const parsed = parsePromotions(xml, chainKey);
  const chainId = chainFor(chainKey, parsed.chainId);
  if (parsed.layout === "unknown") return { layout: "unknown" };
  const storeId = storeOf(deps, chainId, fileName, parsed.storeId, "promotions");
  if (!storeId) return { layout: parsed.layout, store: parsed.storeId, loaded: 0, unpriced: [] };
  const update = parseFileName(basename(fileName))?.type === "promo";
  const insertPromotion = sqlite.prepare(
    `INSERT INTO promotions (store_id, promotion_id, description, kind, min_qty, amount, audience, starts_at, ends_at, days, limit_qty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertItem = sqlite.prepare("INSERT OR IGNORE INTO promotion_items (promotion_id, code) VALUES (?, ?)");
  sqlite.transaction(() => {
    if (update) sqlite.prepare("DELETE FROM promotions WHERE store_id = ? AND promotion_id IN (SELECT value FROM json_each(?))").run(storeId, JSON.stringify(parsed.ids));
    else sqlite.prepare("DELETE FROM promotions WHERE store_id = ?").run(storeId);
    for (const p of parsed.promotions) {
      const { lastInsertRowid } = insertPromotion.run(storeId, p.promotionId, p.description, p.kind, p.minQty, p.amount, p.audience, p.startsAt, p.endsAt, p.days, p.limitQty);
      for (const code of p.codes) insertItem.run(lastInsertRowid, productCode(chainId, code));
    }
  })();
  return { layout: parsed.layout, store: storeId.slice(chainId.length + 1), loaded: parsed.promotions.length, unpriced: parsed.unpriced };
}

export const readXml = (file: string) => decodeXml(readFileSync(file));
