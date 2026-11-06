// Price-file names and contents, as every portal publishes them (docs/research/price-data.md section 1).
import { basename } from "node:path";
import { id } from "#/ingest/parse.ts";
import type { PriceFile } from "#/services/price-portal.ts";

export type ParsedName = { type: string; key: string; ts: string };

/**
 * "PriceFull7290058140886-001-039-20261101-001003.gz", "pricefull7290058140886-039-202611010514.gz" and laibcatalog's
 * "Stores7290696200003-000-20261101060100-060100.gz" (time repeated after a dash) -> type, store key, timestamp.
 */
export function parseFileName(name: string): ParsedName | null {
  const m = /^([a-z]+)(\d[\d-]*?)-(\d{8})-?(\d{3,6})(?:-\d+)?(?:\.|$)/i.exec(name);
  return m ? { type: m[1]!.toLowerCase(), key: m[2]!, ts: m[3]! + m[4]!.padEnd(6, "0") } : null;
}

/** The store a price file's name (or path) names: "...-001-407-..." and "...-0407-..." -> "407"; null without a store segment. */
export function storeOfFileName(file: string) {
  const segments = parseFileName(basename(file))?.key.split("-") ?? [];
  return segments.length > 1 ? id(segments.at(-1)) : null;
}

export type PickedFile = PriceFile & ParsedName & { update?: PriceFile & ParsedName };

/** The newest file of `type` per file key, only for `chainIds` (Keshet's account also lists a 2024 Carrefour file). */
function newestOfType(files: PriceFile[], chainIds: string[], type: string) {
  const newest = new Map<string, PickedFile>();
  for (const f of files) {
    const p = parseFileName(f.name);
    if (p?.type === type && chainIds.some((id) => p.key.startsWith(id)) && (newest.get(p.key)?.ts ?? "") < p.ts) newest.set(p.key, { ...f, ...p });
  }
  return newest;
}

/**
 * Per store (file key), the newest `fullType` file ("pricefull", "promofull") with, as `update`, the newest `updateType`
 * file ("price", "promo") timestamped after it. Update files hold every change since that day's full file, so the newest
 * one is enough; one older than the full file belongs to an earlier day.
 */
export function newestFullAndUpdate(files: PriceFile[], chainIds: string[], fullType: string, updateType: string) {
  const updates = newestOfType(files, chainIds, updateType);
  const full = newestOfType(files, chainIds, fullType);
  for (const [k, f] of full) {
    const u = updates.get(k);
    if (u && u.ts > f.ts) f.update = u;
  }
  return full;
}

/** Newest Stores file plus the newest PriceFull (with its newest update) of the first `maxStores` stores, by file key. */
export function pickFiles(files: PriceFile[], maxStores: number, chainIds: string[]) {
  let stores: PickedFile | undefined;
  // Hazi Hinam names its Stores file "StoresFull...".
  const all = [...newestOfType(files, chainIds, "stores").values(), ...newestOfType(files, chainIds, "storesfull").values()];
  for (const s of all) if ((stores?.ts ?? "") < s.ts) stores = s;
  const full = newestFullAndUpdate(files, chainIds, "pricefull", "price");
  const prices = [...full.keys()].sort().slice(0, maxStores).map((k) => full.get(k)!);
  return { stores, prices };
}
