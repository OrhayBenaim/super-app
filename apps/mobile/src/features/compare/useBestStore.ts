import { missingBasket, type ListDetail } from "@/features/lists/api";
import { useLocation } from "@/lib/location";
import { useCompare, useRadius } from "./api";
import { sortStores } from "./sort";

/**
 * Nearby stores for a List's basket, cheapest first, from the same query Compare uses, so sheets read its cached
 * result; empty until location and prices are in. Never asks for location. `updating` is true while the query refetches,
 * cached or not (when the List's items change, the stores are the previous result until the new one lands).
 */
export function useCompareStores(list?: ListDetail) {
  const compare = useCompare(useLocation().coords, useRadius((s) => s.km), missingBasket(list));
  return { stores: sortStores(compare.data?.stores ?? [], "price"), updating: compare.isFetching };
}

/** The cheapest nearby store for a List's basket, or null. */
export const useBestStore = (list?: ListDetail) => useCompareStores(list).stores[0] ?? null;
