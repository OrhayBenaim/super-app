import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Deps } from "#/deps.ts";
import { chainByKey } from "#/ingest/chains.ts";
import { looksLikePriceFile, pickFiles } from "#/ingest/files.ts";

export const fetchPricesData = z.object({
  chain: z.string().min(1),
  out: z.string().min(1).optional(),
  storesOnly: z.boolean().default(false),
  maxStores: z.coerce.number().int().min(1).default(3),
});
export type FetchPricesData = z.input<typeof fetchPricesData>;

/** Downloads the newest Stores file and the newest PriceFull of the first `maxStores` stores. Returns the saved paths. */
export function fetchPricesJob(deps: Deps) {
  return async (data: FetchPricesData) => {
    const { chain: key, out, storesOnly, maxStores } = fetchPricesData.parse(data);
    const chain = chainByKey(key);
    const outDir = out ?? join(tmpdir(), "grocer-prices", chain.key);
    const portal = await deps.pricePortal.open(chain);
    const { stores, prices } = pickFiles(portal.files, storesOnly ? 0 : maxStores, chain.ids);
    if (!stores) throw new Error(`${chain.key}: no Stores file among ${portal.files.length} listed files`);
    mkdirSync(outDir, { recursive: true });
    const saved: string[] = [];
    for (const f of [stores, ...prices]) {
      const buf = await portal.download(f);
      if (!looksLikePriceFile(buf)) throw new Error(`${f.name}: not a price file`);
      const path = join(outDir, f.name.replace(/[^\w.-]/g, "_"));
      writeFileSync(path, buf);
      saved.push(path);
      console.log(`${path} ${buf.length} bytes`);
    }
    return saved;
  };
}
