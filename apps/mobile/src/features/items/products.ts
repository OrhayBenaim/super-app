import { useQueries, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { hasBarcode, lookupProductImage } from "./imageLookup";

/** `imageUrl`: undefined while looking up (skeleton), a URL when found, null when there is none. */
export type Product = { code: string; name: string; manufacturer: string | null; unitQty: string | null; storeCount: number; minPrice: number; imageUrl?: string | null };

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

/** The Product image of a product code: undefined while looking up, null with no code, no barcode or no image. */
export function useProductImage(code: string | null): string | null | undefined {
  return useQuery(imageQuery(code)).data;
}

/**
 * Product search for "Match a product" (the API's default 20 results), debounced 250ms; idle under 2 characters.
 * Results arrive without waiting for images; `imageUrl` fills in as each Product's lookup settles.
 */
export function useProductSearch(q: string) {
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const search = useQuery({
    queryKey: ["products", "search", debounced],
    queryFn: () => api<Product[]>(`api/products/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
  const images = useQueries({ queries: (search.data ?? []).map((p) => imageQuery(p.code)) });
  return { isFetching: search.isFetching, data: search.data?.map((p, i) => ({ ...p, imageUrl: images[i].data })) };
}
