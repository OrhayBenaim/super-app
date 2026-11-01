import { expect, it } from "vitest";
import { sortStores, type StoreResult } from "./sort";

const store = (storeId: string, total: number, distanceKm: number, missing: number): StoreResult => ({
  storeId, chainId: "c", chainName: "C", storeName: storeId, address: "", city: "", lat: 0, lng: 0,
  distanceKm, total, matched: 5 - missing, missingCodes: Array.from({ length: missing }, (_, i) => `m${i}`), items: [], orderUrl: null,
});

// a: cheap but missing 2; b: complete, pricier; c: complete, cheapest complete, far; d: like c but nearer
const stores = [store("a", 10, 1, 2), store("b", 50, 2, 0), store("c", 40, 9, 0), store("d", 40, 3, 0)];
const ids = (s: StoreResult[]) => s.map((x) => x.storeId);

it("price: fewest missing first, then lowest total, then nearest", () => {
  expect(ids(sortStores(stores, "price"))).toEqual(["d", "c", "b", "a"]);
});

it("distance: nearest first", () => {
  expect(ids(sortStores(stores, "distance"))).toEqual(["a", "b", "d", "c"]);
});

it("coverage: most matched, then price, then nearest", () => {
  expect(ids(sortStores([store("x", 5, 1, 1), ...stores], "coverage"))).toEqual(["d", "c", "b", "x", "a"]);
});

it("does not mutate the input", () => {
  const copy = [...stores];
  sortStores(stores, "distance");
  expect(stores).toEqual(copy);
});
