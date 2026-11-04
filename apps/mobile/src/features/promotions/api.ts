import type { ProductType } from "@grocer/shared/product-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Coords } from "@/lib/location";
import { nearQuery } from "@/features/home/api";
import { promotionsQuery, type PromoCard, type PromoPage } from "./promo";

export type Chain = { id: string; name: string; nameHe: string };

/** The Promotions cards nearby; nothing is fetched without a location (the screen asks for one instead). */
export const usePromotions = (coords: Coords | null, radiusKm: number, type: ProductType | null, chain: string | null) => {
  const q = coords ? promotionsQuery(coords, radiusKm, type, chain) : "";
  return useQuery({
    queryKey: ["browse", "promotions", q],
    queryFn: () => api<PromoCard[]>(`api/browse/promotions${q}`),
    enabled: !!coords,
    placeholderData: keepPreviousData,
  });
};

/** A Promotions card's product page; nothing is fetched without a location. */
export const usePromotionPage = (type: ProductType, ref: string, coords: Coords | null, radiusKm: number) => {
  const q = nearQuery(coords, radiusKm);
  return useQuery({
    queryKey: ["browse", "promotions", type, "groups", ref, q],
    queryFn: () => api<PromoPage>(`api/browse/promotions/types/${type}/groups/${encodeURIComponent(ref)}${q}`),
    enabled: !!coords,
    placeholderData: keepPreviousData,
  });
};

/** Every Chain, for the Chain filter and the product page's Chain names. */
export const useChains = () => useQuery({ queryKey: ["chains"], queryFn: () => api<Chain[]>("api/chains"), staleTime: Infinity });
