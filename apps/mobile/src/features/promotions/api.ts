import type { ProductType } from "@grocer/shared/product-types";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Coords } from "@/lib/location";
import { useBrowse } from "@/features/home/api";
import { promotionsQuery, type PromoCard, type PromoPage } from "./promo";

export type Chain = { id: string; name: string; nameHe: string };

/** The Promotions cards nearby; nothing is fetched without a location (the screen asks for one instead). */
export const usePromotions = (coords: Coords | null, radiusKm: number, type: ProductType | null, chain: string | null) =>
  useBrowse<PromoCard[]>("promotions", coords, radiusKm, !!coords, coords ? promotionsQuery(coords, radiusKm, type, chain) : "");

/** A Promotions card's product page; nothing is fetched without a location. */
export const usePromotionPage = (type: ProductType, ref: string, coords: Coords | null, radiusKm: number) =>
  useBrowse<PromoPage>(`promotions/types/${type}/groups/${encodeURIComponent(ref)}`, coords, radiusKm, !!coords);

/** Every Chain, for the Chain filter and the product page's Chain names. */
export const useChains = () => useQuery({ queryKey: ["chains"], queryFn: () => api<Chain[]>("api/chains"), staleTime: Infinity });
