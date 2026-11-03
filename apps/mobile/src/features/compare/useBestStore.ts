import { missingBasket, type ListDetail } from "@/features/lists/api";
import { useLocation } from "@/lib/location";
import { useCompare, useRadius } from "./api";
import { sortStores } from "./sort";

/**
 * The cheapest nearby store for a List's basket, from the same query Compare uses, so sheets read its cached result;
 * null until location and prices are in. Never asks for location.
 */
export function useBestStore(list?: ListDetail) {
  const compare = useCompare(useLocation().coords, useRadius((s) => s.km), missingBasket(list));
  return sortStores(compare.data?.stores ?? [], "price")[0] ?? null;
}
