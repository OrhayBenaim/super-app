import { useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import type { SoldBy } from "@grocer/shared/quantity";
import { SEARCH } from "@grocer/shared/search";
import { api } from "@/lib/api";
import { hasBarcode, lookupProductImage } from "./imageLookup";

export type Measure = "kg" | "l" | "unit";
/** One product. `size` is in kilos or liters, or a pack count; null when it can't be read. */
export type Product = {
  kind: "product"; code: string; name: string; manufacturer: string | null; unitQty: string | null;
  measure: Measure | null; size: number | null; storeCount: number;
  /** Per kilo when sold by weight. */
  minPrice: number; soldBy: SoldBy;
  /** undefined while looking up (skeleton), a URL when found, null when there is none. */
  imageUrl?: string | null;
};
/**
 * A Product group (CONTEXT.md): `minPrice` is per kilo or liter, or per pack for a unit group; `size` is its commonest
 * pack (kilos or liters) or its pack count. `refinements` are next words that narrow it.
 */
export type ProductGroup = {
  kind: "group"; ref: string; name: string; measure: Measure; size: number; soldBy: SoldBy;
  productCount: number; storeCount: number; minPrice: number; refinements: string[];
  /** The best-matching products first; the group shows the first one's image that has one. */
  topCodes: string[];
  /** As Product.imageUrl. */
  imageUrl?: string | null;
};
export type SearchResult = Product | ProductGroup;

/** Splits a search response into its group rows and its specific products. */
export const splitResults = (results: SearchResult[] = []) => ({
  groups: results.filter((r): r is ProductGroup => r.kind === "group"),
  products: results.filter((r): r is Product => r.kind === "product"),
});

/**
 * Each code is looked up once per app session; a found image starts downloading into expo-image's cache right away.
 * No code or no barcode starts as null (none), so it never shows a skeleton.
 */
const imageQuery = (code: string | null) => ({
  queryKey: ["products", "image", code],
  queryFn: async () => {
    const url = await lookupProductImage(code!);
    if (url) Image.prefetch(url).catch(() => {});
    return url;
  },
  enabled: hasBarcode(code),
  initialData: hasBarcode(code) ? undefined : null,
  staleTime: Infinity,
  gcTime: Infinity,
});

/** The first image `lookup` finds for these codes, in order, skipping codes with no barcode; null when none has one. */
export async function firstImage(codes: string[], lookup: (code: string) => Promise<string | null>) {
  for (const code of codes.filter(hasBarcode)) {
    const url = await lookup(code);
    if (url) return url;
  }
  return null;
}

/** A group's image: its first top product with one, each code looked up through (and cached as) its own imageQuery. */
const groupImageQuery = (client: QueryClient, codes: string[]) => ({
  queryKey: ["products", "groupImage", codes],
  queryFn: () => firstImage(codes, (code) => client.fetchQuery(imageQuery(code))),
  enabled: codes.some(hasBarcode),
  initialData: codes.some(hasBarcode) ? undefined : null,
  staleTime: Infinity,
  gcTime: Infinity,
});

/** The Product image of a product code: undefined while looking up, null with no code, no barcode or no image. */
export function useProductImage(code: string | null): string | null | undefined {
  return useQuery(imageQuery(code)).data;
}

// shortcut: tries only the first 5 codes, one after another; look further if cards of big groups still show none.
const CARD_IMAGE_CODES = 5;

/** A browse card's image: its commonest Product's, else the first of its other Products' that has one. */
export function useCardImage(card: { code: string; codes: string[] }): string | null | undefined {
  const codes = [card.code, ...card.codes.filter((c) => c !== card.code)].slice(0, CARD_IMAGE_CODES);
  return useQuery(groupImageQuery(useQueryClient(), codes)).data;
}

/**
 * Product search for "Match a product" (the API's default 20 results), debounced 250ms; idle under 2 characters.
 * Results arrive without waiting for images; `imageUrl` fills in as each Product's (or group's) lookup settles.
 * With `storeId`, only what that store prices, at its prices.
 */
export function useProductSearch(q: string, storeId?: string) {
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const search = useQuery({
    queryKey: ["products", "search", debounced, storeId],
    queryFn: () =>
      api<SearchResult[]>(`api/products/search?q=${encodeURIComponent(debounced)}${storeId ? `&storeId=${encodeURIComponent(storeId)}` : ""}`),
    enabled: debounced.length >= SEARCH.minLength,
    staleTime: 60_000,
  });
  const client = useQueryClient();
  const { groups, products } = splitResults(search.data);
  const images = useQueries({ queries: products.map((p) => imageQuery(p.code)) });
  const groupImages = useQueries({ queries: groups.map((g) => groupImageQuery(client, g.topCodes)) });
  const imageOf = new Map(products.map((p, i) => [p.code, images[i].data]));
  const groupImageOf = new Map(groups.map((g, i) => [g.ref, groupImages[i].data]));
  return {
    isFetching: search.isFetching,
    data: search.data?.map((r): SearchResult =>
      r.kind === "product" ? { ...r, imageUrl: imageOf.get(r.code) } : { ...r, imageUrl: groupImageOf.get(r.ref) },
    ),
  };
}
