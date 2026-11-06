// The per-Chain steps of a Price sync (CONTEXT.md "Prices"), shared by the sync and the one-shot fetch and geocode jobs.
import Database from "better-sqlite3";
import type { Deps } from "#/deps.ts";
import type { ChainSeed } from "#/ingest/chains.ts";
import { newestFullAndUpdate, pickFiles, type PickedFile } from "#/ingest/files.ts";
import { ingestPrices, ingestPromotions, ingestStores } from "#/ingest/ingest.ts";
import type { PriceFile } from "#/services/price-portal.ts";

/** Prices that can't be saved are a Chain failure (CONTEXT.md), so a DB error goes on; a download or parse error doesn't. */
const rethrowSaveError = (e: unknown) => {
  if (e instanceof Database.SqliteError) throw e;
};

/**
 * Opens the Chain's portal: the newest Stores file first, then the newest PriceFull of the first `maxStores` stores, and
 * apart from them (`promos`) the newest PromoFull of the first `maxStores` stores, each with its newest update.
 */
export async function openChainFiles({ pricePortal }: Pick<Deps, "pricePortal">, chain: ChainSeed, maxStores: number) {
  const portal = await pricePortal.open(chain);
  const { stores, prices } = pickFiles(portal.files, maxStores, chain.ids);
  if (!stores) throw new Error(`${chain.key}: no Stores file among ${portal.files.length} listed files`);
  const promoFull = newestFullAndUpdate(portal.files, chain.ids, "promofull", "promo");
  return {
    files: [stores, ...prices],
    promos: [...promoFull.keys()].sort().slice(0, maxStores).map((k) => promoFull.get(k)!),
    download: (f: PriceFile) => portal.download(f),
  };
}

/** Fills lat/lng of stores that have none (of one ChainId, or all when null). Returns how many were found. */
export async function geocodeStores({ db, geocoder }: Pick<Deps, "db" | "geocoder">, chainId: string | null) {
  const sqlite = db.$client;
  const rows = sqlite
    .prepare("SELECT id, address, city, name FROM stores WHERE (lat IS NULL OR lng IS NULL) AND (? IS NULL OR chain_id = ?)")
    .all(chainId, chainId) as { id: string; address: string; city: string; name: string }[];
  const update = sqlite.prepare("UPDATE stores SET lat = ?, lng = ? WHERE id = ?");
  let found = 0;
  for (const [i, s] of rows.entries()) {
    // One failed lookup (rate limit, timeout) must not stop the run; the store stays without coordinates for the next one.
    const hit = await geocoder.geocode(s).catch((e: unknown) => (console.error(`${s.id}: ${e}`), null));
    if (hit) {
      update.run(hit.lat, hit.lng, s.id);
      found++;
    }
    console.log(`${i + 1}/${rows.length} ${s.id} ${hit ? `${hit.lat},${hit.lng}` : "not found"}`);
  }
  console.log(`geocoded ${found}/${rows.length}`);
  return found;
}

export type ChainCounts = {
  filesDownloaded: number;
  storesLoaded: number;
  pricesLoaded: number;
  storesGeocoded: number;
  promotionsLoaded: number;
  /** Null until the Chain's promotion files are tried (a Chain failure before them). */
  promotionStatus: "ok" | "failed" | null;
  promotionError: string | null;
};

/**
 * Loads each store's newest PromoFull and then its update, never throwing: a file that fails leaves its store's previous
 * Promotions (an update that fails, the PromoFull's). Every file failing is a Promotion failure (CONTEXT.md); files in
 * a layout Grocer can't read yet count neither way. Sends one warning listing the Promotions it couldn't price
 * (reason -> PromotionID -> stores) and the files in an unknown layout, when there are any.
 */
async function syncPromotions(deps: Deps, chain: ChainSeed, promos: PickedFile[], load: (f: PriceFile) => Promise<string>, counts: ChainCounts) {
  let tried = 0;
  let failed = 0;
  const unpriced: Record<string, Record<string, string[]>> = {};
  const unknownLayout: string[] = [];
  const ingest = async (f: PriceFile) => {
    const outcome = ingestPromotions(deps, chain.key, await load(f), f.name);
    if (outcome.layout === "unknown") unknownLayout.push(f.name);
    else
      for (const u of outcome.unpriced) {
        const stores = ((unpriced[u.reason] ??= {})[u.promotionId] ??= []);
        if (!stores.includes(outcome.store)) stores.push(outcome.store);
      }
    return outcome;
  };
  for (const f of promos) {
    try {
      const full = await ingest(f);
      if (full.layout === "unknown") {
        console.warn(`${f.name}: promotion layout not known yet; the store keeps its previous Promotions`);
        continue;
      }
      tried++;
      counts.promotionsLoaded += full.loaded;
    } catch (e) {
      tried++;
      failed++;
      counts.promotionError = `${f.name}: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`${f.name}: skipped these promotions`, e);
      continue;
    }
    if (f.update) {
      const u = await ingest(f.update).catch((e: unknown) => (console.error(`${f.update!.name}: skipped this promotion update`, e), null));
      if (u && u.layout !== "unknown") counts.promotionsLoaded += u.loaded;
    }
  }
  counts.promotionStatus = tried > 0 && failed === tried ? "failed" : "ok";
  if (counts.promotionStatus === "ok") counts.promotionError = null;
  const notPriced = Object.values(unpriced).reduce((n, ids) => n + Object.keys(ids).length, 0);
  if (notPriced || unknownLayout.length)
    deps.errorHandler.warn(`${chain.key}: ${notPriced} Promotions not priced, ${unknownLayout.length} promotion files in an unknown layout`, {
      unpriced,
      unknownLayout,
    });
}

/**
 * Downloads and loads the Chain's newest Stores file and PriceFull files, each followed by its store's price update file,
 * then its promotion files the same way, one at a time, in memory (nothing is written to disk), then geocodes its stores
 * without a location. Fills `counts` as it goes, so a failure still shows how far it got.
 */
export async function syncChain(deps: Deps, chain: ChainSeed, maxStores: number, counts: ChainCounts) {
  const { files, promos, download } = await openChainFiles(deps, chain, maxStores);
  const load = async (f: PriceFile) => {
    const xml = await download(f);
    counts.filesDownloaded++;
    return xml;
  };
  const [stores, ...prices] = files;
  counts.storesLoaded = ingestStores(deps, chain.key, await load(stores!));
  for (const f of prices) {
    // A PriceFull that can't be downloaded or read is a Store failure (CONTEXT.md): the store keeps its previous prices.
    try {
      counts.pricesLoaded += ingestPrices(deps, chain.key, await load(f), f.name);
    } catch (e) {
      rethrowSaveError(e);
      console.error(`${f.name}: skipped this store's prices`, e);
      continue;
    }
    // An update that can't be downloaded or read leaves the store on its full file's prices; not a Chain failure.
    if (f.update)
      counts.pricesLoaded += await load(f.update)
        .then((u) => ingestPrices(deps, chain.key, u, f.update!.name))
        .catch((e: unknown) => (rethrowSaveError(e), console.error(`${f.update!.name}: skipped this price update`, e), 0));
  }
  await syncPromotions(deps, chain, promos, load, counts);
  // A file fails, or ingestPrices skips it when its store is not in the Stores file; when every file does, the chain is broken.
  if (prices.length && counts.pricesLoaded === 0)
    throw new Error(`${chain.key}: no prices loaded from any of ${prices.length} PriceFull files (failed, or stores not in the Stores file)`);
  counts.storesGeocoded = await geocodeStores(deps, chain.ids[0]!);
}
