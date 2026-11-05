import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { api } from "@/lib/api";
import { chainName } from "@/lib/strings";
import type { Basket } from "@/features/lists/api";
import type { Coords } from "@/lib/location";
import type { CompareResponse, Sort } from "./sort";

export const RADII = [5, 10, 20] as const;

/** Search radius, shared by Compare and the List's "cheapest now" row so both read the same query. */
export const useRadius = create<{ km: number; set: (km: number) => void }>((set) => ({ km: 10, set: (km) => set({ km }) }));

export async function fetchCompare(body: Coords & Basket & { radiusKm: number; sort: Sort; limit: number }): Promise<CompareResponse> {
  const res = await api<CompareResponse>("api/compare", { method: "POST", body: JSON.stringify(body) });
  return { ...res, stores: res.stores.map((s) => ({ ...s, chainName: chainName(s.chainName) })) };
}

// Sort is applied client-side (see sortStores), so it is not part of the key: re-sorting never refetches.
// Quantities are: changing one refetches.
// We fetch the max page (100) so the client sort sees every store a server sort would.
export function useCompare(coords: Coords | null, radiusKm: number, { items, groups }: Basket) {
  // ~100 m rounding keeps GPS jitter from refetching.
  const lat = coords && Math.round(coords.lat * 1000) / 1000;
  const lng = coords && Math.round(coords.lng * 1000) / 1000;
  const basket = {
    items: [...items].sort((a, b) => a.code.localeCompare(b.code) || a.quantity - b.quantity),
    groups: [...groups].sort((a, b) => a.ref.localeCompare(b.ref) || a.quantity - b.quantity),
  };
  const enabled = lat != null && lng != null && items.length + groups.length > 0;
  return useQuery({
    queryKey: ["compare", lat, lng, radiusKm, basket],
    queryFn: () => fetchCompare({ lat: lat!, lng: lng!, radiusKm, ...basket, sort: "price", limit: 100 }),
    enabled,
    // When the List's items change, the previous result stays until the new one lands; with no items it shows nothing.
    placeholderData: enabled ? keepPreviousData : undefined,
  });
}

/** A store's chain name from a Compare result already in the cache; never fetches or asks for location. */
export function useCachedChainName(storeId?: string) {
  const client = useQueryClient();
  if (!storeId) return undefined;
  const cached = client.getQueriesData<CompareResponse>({ queryKey: ["compare"] });
  return cached.flatMap(([, data]) => data?.stores ?? []).find((s) => s.storeId === storeId)?.chainName;
}
