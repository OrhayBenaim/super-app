import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Coords } from "@/lib/location";
import type { CompareResponse, Sort } from "./sort";

export const RADII = [5, 10, 20] as const;

export const fetchCompare = (body: Coords & { radiusKm: number; codes: string[]; sort: Sort; limit: number }) =>
  api<CompareResponse>("api/compare", { method: "POST", body: JSON.stringify(body) });

// Sort is applied client-side (see sortStores), so it is not part of the key: re-sorting never refetches.
// We fetch the max page (100) so the client sort sees every store a server sort would.
export function useCompare(coords: Coords | null, radiusKm: number, codes: string[]) {
  // ~100 m rounding keeps GPS jitter from refetching.
  const lat = coords && Math.round(coords.lat * 1000) / 1000;
  const lng = coords && Math.round(coords.lng * 1000) / 1000;
  const sorted = [...codes].sort();
  return useQuery({
    queryKey: ["compare", lat, lng, radiusKm, sorted],
    queryFn: () => fetchCompare({ lat: lat!, lng: lng!, radiusKm, codes: sorted, sort: "price", limit: 100 }),
    enabled: lat != null && lng != null && codes.length > 0,
  });
}
