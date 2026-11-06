import type { ProductType } from "@grocer/shared/product-types";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { chainName } from "@/lib/strings";
import type { Coords } from "@/lib/location";
import { BROWSE_STALE_MS, useBrowse } from "@/features/home/api";
import { promotionsQuery, type PromoCardsPage, type PromoPage } from "./promo";

export type Chain = { id: string; name: string };

/**
 * The Promotions cards nearby, a page at a time (`fetchNextPage` as the User scrolls); nothing is fetched without a
 * location (the screen asks for one instead).
 */
export function usePromotions(coords: Coords | null, radiusKm: number, type: ProductType | null, chain: string | null) {
  const query = coords ? promotionsQuery(coords, radiusKm, type, chain) : "";
  return useInfiniteQuery({
    queryKey: ["browse", "promotions", query],
    queryFn: ({ pageParam }) => api<PromoCardsPage>(`api/browse/promotions${query}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next,
    enabled: !!coords,
    placeholderData: keepPreviousData,
    staleTime: BROWSE_STALE_MS,
  });
}

/** A Promotions card's product page; nothing is fetched without a location. */
export const usePromotionPage = (type: ProductType, ref: string, coords: Coords | null, radiusKm: number) =>
  useBrowse<PromoPage>(`promotions/types/${type}/groups/${encodeURIComponent(ref)}`, coords, radiusKm, !!coords);

/** Every Chain, for the Chain filter and the product page's Chain names. */
export const useChains = () => useQuery({ queryKey: ["chains"], queryFn: async () => (await api<Chain[]>("api/chains")).map((c) => ({ ...c, name: chainName(c.name) })), staleTime: Infinity });
