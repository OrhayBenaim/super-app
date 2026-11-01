import { expect, it } from "vitest";
import { MAX_REGIONS, toRegions } from "./regions";

const stores = Array.from({ length: 25 }, (_, i) => ({ storeId: `s${i}`, lat: 32 + i / 100, lng: 34.8 }));

it("keeps the first 20 stores (iOS region limit) in order", () => {
  const regions = toRegions(stores);
  expect(regions).toHaveLength(MAX_REGIONS);
  expect(regions.map((r) => r.identifier)).toEqual(stores.slice(0, 20).map((s) => s.storeId));
});

it("builds 250 m enter-only regions keyed by storeId", () => {
  expect(toRegions(stores.slice(0, 1))).toEqual([
    { identifier: "s0", latitude: 32, longitude: 34.8, radius: 250, notifyOnEnter: true, notifyOnExit: false },
  ]);
});

it("returns no regions for no stores", () => {
  expect(toRegions([])).toEqual([]);
});
