import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Deps } from "#/deps.ts";
import { chainByKey } from "#/ingest/chains.ts";
import { parseFileName } from "#/ingest/files.ts";
import { decodeXml, isGtin, parsePrices, parseStores } from "#/ingest/parse.ts";

type IngestDeps = Pick<Deps, "db" | "clock">;

function chainFor(key: string, fileChainId: string) {
  const chain = chainByKey(key);
  if (!chain.ids.includes(fileChainId)) throw new Error(`file ChainId ${fileChainId} is not ${key} (${chain.ids.join(", ")})`);
  return chain.ids[0]!;
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
 * Pass the file's name: its store wins over the StoreID inside. A store missing from the Stores file is skipped (returns 0).
 * shortcut: assumes every file is a full snapshot, not a delta.
 */
export function ingestPrices({ db, clock }: IngestDeps, chainKey: string, xml: string, fileName?: string) {
  const sqlite = db.$client;
  const parsed = parsePrices(xml);
  const chainId = chainFor(chainKey, parsed.chainId);
  // Carrefour's former Yeinot Bitan stores (files 400-473) carry their old StoreID inside, and 26 of those are other live
  // stores (file 407 says 117); the name matches the Stores file (2026-11-01).
  const segments = fileName ? (parseFileName(basename(fileName))?.key.split("-") ?? []) : [];
  const storeId = `${chainId}-${segments.length > 1 ? segments.at(-1)!.replace(/^0+(?=\d)/, "") : parsed.storeId}`;
  // Shufersal still lists months-old PriceFull files of closed stores; they must not abort the rest of the chain.
  if (!sqlite.prepare("SELECT 1 FROM stores WHERE id = ?").get(storeId)) {
    console.warn(`store ${storeId} is not in the chain's Stores file; skipped its prices`);
    return 0;
  }
  const now = clock.now().getTime();
  const valid = parsed.items.filter((it) => it.price > 0); // also drops NaN
  if (valid.length < parsed.items.length) console.warn(`${storeId}: skipped ${parsed.items.length - valid.length} items with price <= 0`);
  // Real files repeat an ItemCode now and then (Keshet: 7.90 and 8.90 for one code); the last row wins, as the upsert would.
  // GS1 barcodes are global; internal and weighed codes mean different things per chain, so they are chain-scoped.
  const key = (code: string) => (isGtin(code) ? code : `${chainId}:${code}`);
  const items = [...new Map(valid.map((it) => [key(it.code), it])).entries()];
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
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM prices WHERE store_id = ?").run(storeId);
    for (const [code, it] of items) {
      upsertProduct.run(code, it.code, it.name, it.manufacturer, it.unitQty, it.isWeighted ? 1 : 0);
      upsertPrice.run(storeId, code, it.price, it.unitPrice, now);
    }
  })();
  return items.length;
}

export const readXml = (file: string) => decodeXml(readFileSync(file));
