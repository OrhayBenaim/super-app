// The per-Chain steps of a Price sync (CONTEXT.md "Prices"), shared by the sync and the one-shot fetch and geocode jobs.
import type { Deps } from "#/deps.ts";
import type { ChainSeed } from "#/ingest/chains.ts";
import { looksLikePriceFile, pickFiles } from "#/ingest/files.ts";
import { ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { decodeXml } from "#/ingest/parse.ts";
import type { PriceFile } from "#/services/price-portal.ts";

/** Opens the Chain's portal: the newest Stores file first, then the newest PriceFull of the first `maxStores` stores. */
export async function openChainFiles({ pricePortal }: Pick<Deps, "pricePortal">, chain: ChainSeed, maxStores: number) {
  const portal = await pricePortal.open(chain);
  const { stores, prices } = pickFiles(portal.files, maxStores, chain.ids);
  if (!stores) throw new Error(`${chain.key}: no Stores file among ${portal.files.length} listed files`);
  return {
    files: [stores, ...prices],
    async download(f: PriceFile) {
      const buf = await portal.download(f);
      if (!looksLikePriceFile(buf)) throw new Error(`${f.name}: not a price file`);
      return buf;
    },
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

export type ChainCounts = { filesDownloaded: number; storesLoaded: number; pricesLoaded: number; storesGeocoded: number };

/**
 * Downloads and loads the Chain's newest Stores file and PriceFull files one at a time, in memory (nothing is written to
 * disk), then geocodes its stores without a location. Fills `counts` as it goes, so a failure still shows how far it got.
 */
export async function syncChain(deps: Deps, chain: ChainSeed, maxStores: number, counts: ChainCounts) {
  const { files, download } = await openChainFiles(deps, chain, maxStores);
  for (const [i, f] of files.entries()) {
    const xml = decodeXml(Buffer.from(await download(f)));
    counts.filesDownloaded++;
    if (i === 0) counts.storesLoaded = ingestStores(deps, chain.key, xml);
    else counts.pricesLoaded += ingestPrices(deps, chain.key, xml, f.name);
  }
  counts.storesGeocoded = await geocodeStores(deps, chain.ids[0]!);
}
