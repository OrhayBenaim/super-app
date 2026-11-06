import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Deps } from "#/deps.ts";
import { openChainFiles } from "#/ingest/chain-sync.ts";
import { chainByKey } from "#/ingest/chains.ts";

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
    const { files, download } = await openChainFiles(deps, chain, storesOnly ? 0 : maxStores);
    mkdirSync(outDir, { recursive: true });
    const saved: string[] = [];
    for (const f of files) {
      const xml = await download(f); // saved decoded, whatever the name's extension; ingest reads either
      const path = join(outDir, f.name.replace(/[^\w.-]/g, "_"));
      writeFileSync(path, xml);
      saved.push(path);
      console.log(`${path} ${xml.length} characters`);
    }
    return saved;
  };
}
