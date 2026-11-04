import { expect, it } from "vitest";
import { openSplit, saving, sortStores, type StoreResult } from "@/features/compare/sort";

const store = (storeId: string, total: number, distanceKm: number, missing: number): StoreResult => ({
  storeId, chainId: "c", chainName: "C", storeName: storeId, address: "", city: "", lat: 0, lng: 0,
  distanceKm, total, matched: 5 - missing, missingCodes: Array.from({ length: missing }, (_, i) => `m${i}`), items: [], orderUrl: null, fillsCart: false,
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

it("saving compares the cheapest store against the next one with the same coverage", () => {
  // Price order: d (40, near), c (40, far), b (50); a is cheaper but prices a smaller basket.
  expect(saving(stores)).toBeNull(); // d and c tie
  expect(saving([store("x", 21.7, 1, 1), store("y", 20, 1, 2), store("z", 22.9, 1, 1)])).toEqual({ amount: 1.2, chainName: "C" });
  expect(saving([store("x", 10, 1, 0)])).toBeNull();
  expect(saving([])).toBeNull();
});

it("openSplit puts the open store as the card between the stores above and below it", () => {
  const [a, b, c] = [store("a", 1, 1, 0), store("b", 2, 2, 0), store("c", 3, 3, 0)];
  expect(openSplit([a, b, c], "b")).toEqual({ open: b, above: [a], below: [c] });
  expect(openSplit([a, b, c], "gone")).toEqual({ open: a, above: [], below: [b, c] }); // refetched away: back to the first
  expect(openSplit([a, b, c], null)).toEqual({ open: a, above: [], below: [b, c] });
  expect(openSplit([], null)).toEqual({ open: undefined, above: [], below: [] });
});
