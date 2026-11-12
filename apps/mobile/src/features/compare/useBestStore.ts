import { useEffect, useState } from "react";
import { basketSize, missingBasket, type ListDetail } from "@/features/lists/api";
import { useLocation } from "@/lib/location";
import { useCompare, useRadius } from "./api";
import { debounce, SETTLE_MS } from "./debounce";
import { sortStores } from "./sort";

/**
 * Nearby stores for a List's basket, cheapest first, from the same query Compare uses, so sheets read its cached
 * result; empty until location and prices are in. Never asks for location. `updating` is true while the query refetches,
 * cached or not (when the List's items change, the stores are the previous result until the new one lands).
 */
export function useCompareStores(list?: ListDetail) {
  const basket = missingBasket(list);
  const [settled, setSettled] = useState(basket);
  // Compare gets the basket once it has held still for SETTLE_MS; until then the previous result stays (useCompare keeps it).
  // The first non-empty basket (the List just loaded) goes at once: there is no previous result to keep.
  const key = JSON.stringify(basket);
  useEffect(() => {
    const settle = debounce(setSettled, SETTLE_MS, () => basketSize(settled) === 0);
    settle(JSON.parse(key));
    return settle.cancel;
  }, [key]);
  const compare = useCompare(useLocation().coords, useRadius((s) => s.km), settled);
  return { stores: sortStores(compare.data?.stores ?? [], "price"), updating: compare.isFetching };
}

/** The cheapest nearby store for a List's basket, or null. */
export const useBestStore = (list?: ListDetail) => useCompareStores(list).stores[0] ?? null;
