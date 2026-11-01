import { z } from "zod";
import type { Deps } from "#/deps.ts";
import { chainByKey } from "#/ingest/chains.ts";

export const geocodeStoresData = z.object({ chain: z.string().min(1).optional() });
export type GeocodeStoresData = z.input<typeof geocodeStoresData>;

/** Fills lat/lng of stores that have none (optionally one chain). Returns how many were found. */
export function geocodeStoresJob(deps: Deps) {
  return async (data: GeocodeStoresData) => {
    const { chain } = geocodeStoresData.parse(data);
    const chainId = chain ? chainByKey(chain).ids[0]! : null;
    const sqlite = deps.db.$client;
    const rows = sqlite
      .prepare("SELECT id, address, city, name FROM stores WHERE (lat IS NULL OR lng IS NULL) AND (? IS NULL OR chain_id = ?)")
      .all(chainId, chainId) as { id: string; address: string; city: string; name: string }[];
    const update = sqlite.prepare("UPDATE stores SET lat = ?, lng = ? WHERE id = ?");
    let found = 0;
    for (const [i, s] of rows.entries()) {
      // One failed lookup (rate limit, timeout) must not stop the run; the store stays without coordinates for the next one.
      const hit = await deps.geocoder.geocode(s).catch((e: unknown) => (console.error(`${s.id}: ${e}`), null));
      if (hit) {
        update.run(hit.lat, hit.lng, s.id);
        found++;
      }
      console.log(`${i + 1}/${rows.length} ${s.id} ${hit ? `${hit.lat},${hit.lng}` : "not found"}`);
    }
    console.log(`geocoded ${found}/${rows.length}`);
    return found;
  };
}
