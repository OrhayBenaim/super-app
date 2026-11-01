import { z } from "zod";
import type { Deps } from "#/deps.ts";
import { geocodeStores } from "#/ingest/chain-sync.ts";
import { chainByKey } from "#/ingest/chains.ts";

export const geocodeStoresData = z.object({ chain: z.string().min(1).optional() });
export type GeocodeStoresData = z.input<typeof geocodeStoresData>;

/** Fills lat/lng of stores that have none (optionally one chain). Returns how many were found. */
export function geocodeStoresJob(deps: Deps) {
  return async (data: GeocodeStoresData) => {
    const { chain } = geocodeStoresData.parse(data);
    return geocodeStores(deps, chain ? chainByKey(chain).ids[0]! : null);
  };
}
