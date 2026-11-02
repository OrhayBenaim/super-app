import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { api } from "@/lib/api";
import type { Basket } from "@/features/lists/api";
import type { Coords } from "@/lib/location";
import type { CompareResponse, Sort } from "./sort";

export const RADII = [5, 10, 20] as const;

/** Search radius, shared by Compare and the List's "cheapest now" row so both read the same query. */
export const useRadius = create<{ km: number; set: (km: number) => void }>((set) => ({ km: 10, set: (km) => set({ km }) }));

export const fetchCompare = ({ groups, ...body }: Coords & Basket & { radiusKm: number; sort: Sort; limit: number }) =>
  api<CompareResponse>("api/compare", { method: "POST", body: JSON.stringify({ ...body, groups: groups.map((ref) => ({ ref })) }) });

// Sort is applied client-side (see sortStores), so it is not part of the key: re-sorting never refetches.
// We fetch the max page (100) so the client sort sees every store a server sort would.
export function useCompare(coords: Coords | null, radiusKm: number, { codes, groups }: Basket) {
  // ~100 m rounding keeps GPS jitter from refetching.
  const lat = coords && Math.round(coords.lat * 1000) / 1000;
  const lng = coords && Math.round(coords.lng * 1000) / 1000;
  const basket = { codes: [...codes].sort(), groups: [...groups].sort() };
  return useQuery({
    queryKey: ["compare", lat, lng, radiusKm, basket],
    queryFn: () => fetchCompare({ lat: lat!, lng: lng!, radiusKm, ...basket, sort: "price", limit: 100 }),
    enabled: lat != null && lng != null && codes.length + groups.length > 0,
  });
}
