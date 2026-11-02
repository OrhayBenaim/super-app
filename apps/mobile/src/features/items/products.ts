import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Measure = "kg" | "l" | "unit";
/** One product. `size` is in kilos or liters, or a pack count; null when it can't be read. */
export type Product = {
  kind: "product"; code: string; name: string; manufacturer: string | null; unitQty: string | null;
  measure: Measure | null; size: number | null; storeCount: number; minPrice: number;
};
/**
 * A Product group (CONTEXT.md): `minPrice` is per kilo or liter, or per pack for a unit group; `size` is its commonest
 * pack (kilos or liters) or its pack count. `refinements` are next words that narrow it.
 */
export type ProductGroup = {
  kind: "group"; ref: string; name: string; measure: Measure; size: number;
  productCount: number; storeCount: number; minPrice: number; refinements: string[];
};
export type SearchResult = Product | ProductGroup;

/** Splits a search response into its group rows and its specific products. */
export const splitResults = (results: SearchResult[] = []) => ({
  groups: results.filter((r): r is ProductGroup => r.kind === "group"),
  products: results.filter((r): r is Product => r.kind === "product"),
});

/** Product search for "Match a product" (the API's default 20 results), debounced 250ms; idle under 2 characters. */
export function useProductSearch(q: string) {
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  return useQuery({
    queryKey: ["products", "search", debounced],
    queryFn: () => api<SearchResult[]>(`api/products/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
}
