import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Product = { code: string; name: string; manufacturer: string | null; unitQty: string | null; storeCount: number; minPrice: number };

/** Product search for "Match a product", debounced 250ms; idle under 2 characters. */
export function useProductSearch(q: string) {
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  return useQuery({
    queryKey: ["products", "search", debounced],
    queryFn: () => api<Product[]>(`api/products/search?q=${encodeURIComponent(debounced)}&limit=8`),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
}
