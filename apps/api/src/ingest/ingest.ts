import { readFileSync } from "node:fs";
import { db } from "../db/index.js";
import { chainSeeds } from "./chains.js";
import { decodeXml, isGtin, parsePrices, parseStores } from "./parse.js";

const sqlite = db.$client;

function chainFor(key: string, fileChainId: string) {
  const chain = chainSeeds.find((c) => c.key === key);
  if (!chain) throw new Error(`unknown chain "${key}"; one of: ${chainSeeds.map((c) => c.key).join(", ")}`);
  if (!chain.ids.includes(fileChainId)) throw new Error(`file ChainId ${fileChainId} is not ${key} (${chain.ids.join(", ")})`);
  return chain.ids[0]!;
}

const upsertStore = sqlite.prepare(
  `INSERT INTO stores (id, chain_id, store_id, sub_chain_id, name, address, city) VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET sub_chain_id = excluded.sub_chain_id, name = excluded.name,
     lat = CASE WHEN stores.address = excluded.address AND stores.city = excluded.city THEN stores.lat END,
     lng = CASE WHEN stores.address = excluded.address AND stores.city = excluded.city THEN stores.lng END,
     address = excluded.address, city = excluded.city`,
);
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
const clearPrices = sqlite.prepare("DELETE FROM prices WHERE store_id = ?");
const storeExists = sqlite.prepare("SELECT 1 FROM stores WHERE id = ?");

/** Upserts a Stores file. Clears lat/lng of a store whose address changed so geocode picks it up again. */
export function ingestStores(chainKey: string, xml: string) {
  const parsed = parseStores(xml);
  const chainId = chainFor(chainKey, parsed.chainId);
  sqlite.transaction(() => {
    for (const s of parsed.stores)
      upsertStore.run(`${chainId}-${s.storeId}`, chainId, s.storeId, s.subChainId, s.name, s.address, s.city);
  })();
  return parsed.stores.length;
}

/**
 * Replaces the store's prices with this PriceFull snapshot (items no longer listed are dropped) and skips items priced <= 0.
 * The store must already exist (ingest its Stores file first). shortcut: assumes every file is a full snapshot, not a delta.
 */
export function ingestPrices(chainKey: string, xml: string) {
  const parsed = parsePrices(xml);
  const chainId = chainFor(chainKey, parsed.chainId);
  const storeId = `${chainId}-${parsed.storeId}`;
  if (!storeExists.get(storeId)) throw new Error(`store ${storeId} is unknown; ingest the chain's Stores file first`);
  const now = Date.now();
  const valid = parsed.items.filter((it) => it.price > 0); // also drops NaN
  if (valid.length < parsed.items.length) console.warn(`${storeId}: skipped ${parsed.items.length - valid.length} items with price <= 0`);
  // Real files repeat an ItemCode now and then (Keshet: 7.90 and 8.90 for one code); the last row wins, as the upsert would.
  // GS1 barcodes are global; internal and weighed codes mean different things per chain, so they are chain-scoped.
  const key = (code: string) => (isGtin(code) ? code : `${chainId}:${code}`);
  const items = [...new Map(valid.map((it) => [key(it.code), it])).entries()];
  sqlite.transaction(() => {
    clearPrices.run(storeId);
    for (const [code, it] of items) {
      upsertProduct.run(code, it.code, it.name, it.manufacturer, it.unitQty, it.isWeighted ? 1 : 0);
      upsertPrice.run(storeId, code, it.price, it.unitPrice, now);
    }
  })();
  return items.length;
}

export const readXml = (file: string) => decodeXml(readFileSync(file));
