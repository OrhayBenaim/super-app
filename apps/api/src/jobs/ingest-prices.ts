import { z } from "zod";
import type { Deps } from "#/deps.ts";
import { ingestPrices, ingestStores, readXml } from "#/ingest/ingest.ts";

export const ingestPricesData = z
  .object({
    chain: z.string().min(1),
    stores: z.string().min(1).optional(),
    prices: z.array(z.string().min(1)).default([]),
  })
  .refine((d) => d.stores || d.prices.length, "pass --stores <file> and/or --prices <file...>");
export type IngestPricesData = z.input<typeof ingestPricesData>;

/** Loads a chain's Stores file and/or PriceFull files into the database. */
export function ingestPricesJob(deps: Deps) {
  return async (data: IngestPricesData) => {
    const { chain, stores, prices } = ingestPricesData.parse(data);
    if (stores) console.log(`${stores}: ${ingestStores(deps, chain, readXml(stores))} stores`);
    for (const f of prices) {
      const t = performance.now();
      console.log(`${f}: ${ingestPrices(deps, chain, readXml(f), f)} prices in ${Math.round(performance.now() - t)} ms`);
    }
  };
}
