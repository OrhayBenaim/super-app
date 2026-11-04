// Browse data (Home now; Promotions and the product pages build on it). Types mirror apps/api/src/prices/browse.ts.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ProductType } from "@grocer/shared/product-types";
import type { SoldBy } from "@grocer/shared/quantity";
import type { Measure } from "@/features/items/products";
import { api } from "@/lib/api";
import type { Coords } from "@/lib/location";

export type TypeCount = { type: ProductType; cardCount: number };
/** A group card: `minPrice` is per kilo, liter or pack nearby (null without a location); `code` is its commonest Product. */
export type Card = {
  ref: string; name: string; measure: Measure; soldBy: SoldBy; size: number; code: string;
  minPrice: number | null; storeCount: number; codes: string[];
};

/** The query string for a location (rounded to ~100 m so GPS jitter never refetches), or none when location is off. */
export const nearQuery = (coords: Coords | null, radiusKm: number) =>
  coords ? `?lat=${Math.round(coords.lat * 1000) / 1000}&lng=${Math.round(coords.lng * 1000) / 1000}&radiusKm=${radiusKm}` : "";

/** `enabled` waits until the location is known one way or the other. */
export const useProductTypes = (coords: Coords | null, radiusKm: number, enabled: boolean) => {
  const q = nearQuery(coords, radiusKm);
  return useQuery({ queryKey: ["browse", "types", q], queryFn: () => api<TypeCount[]>(`api/browse/types${q}`), enabled, placeholderData: keepPreviousData });
};

export const useTypeCards = (type: ProductType, coords: Coords | null, radiusKm: number, enabled: boolean) => {
  const q = nearQuery(coords, radiusKm);
  return useQuery({ queryKey: ["browse", "types", type, q], queryFn: () => api<Card[]>(`api/browse/types/${type}${q}`), enabled, placeholderData: keepPreviousData });
};
