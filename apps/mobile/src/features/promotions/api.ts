import type { ProductType } from "@grocer/shared/product-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Coords } from "@/lib/location";
import { promotionsQuery, type PromoCard } from "./promo";

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

/** Every Chain, for the Chain filter. */
export const useChains = () => useQuery({ queryKey: ["chains"], queryFn: () => api<Chain[]>("api/chains"), staleTime: Infinity });
