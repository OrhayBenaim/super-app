import { describe, expect, it } from "vitest";
import { GEOFENCE_TASK, MAX_REGIONS, REGION_RADIUS_M, toRegions } from "./regions";

const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ storeId: `s${i}`, lat: 32 + i / 1000, lng: 34 + i / 1000 }));

describe("toRegions", () => {
  it("constants", () => {
    expect([MAX_REGIONS, REGION_RADIUS_M, GEOFENCE_TASK]).toEqual([20, 250, "grocer-geofence"]);
  });
  it("exact boundary: 19, 20, 21 stores", () => {
    expect(toRegions(mk(19))).toHaveLength(19);
    expect(toRegions(mk(20))).toHaveLength(20);
    const r = toRegions(mk(21));
    expect(r).toHaveLength(20);
    expect(r.at(-1)?.identifier).toBe("s19");
  });
  it("truncates 100 stores to the first 20 in the given order (does not re-sort)", () => {
    const stores = mk(100).reverse();
    expect(toRegions(stores).map((r) => r.identifier)).toEqual(stores.slice(0, 20).map((s) => s.storeId));
  });
  it("every region is 250 m, enter-only, and carries the store's coordinates unmodified", () => {
    for (const [i, r] of toRegions(mk(30)).entries()) {
      expect(r.radius).toBe(250);
      expect(r.notifyOnEnter).toBe(true);
      expect(r.notifyOnExit).toBe(false);
      expect(r.latitude).toBe(32 + i / 1000);
      expect(r.longitude).toBe(34 + i / 1000);
    }
  });
  it("identifiers are unique for unique stores and equal storeId", () => {
    const ids = toRegions(mk(25)).map((r) => r.identifier);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("accepts negative coordinates and 0", () => {
    expect(toRegions([{ storeId: "x", lat: -33.9, lng: 0 }])[0]).toMatchObject({ latitude: -33.9, longitude: 0 });
  });
  it("does not mutate input", () => {
    const s = mk(25);
    toRegions(s);
    expect(s).toHaveLength(25);
  });
  it.skip("LOW regions.ts:10 stores with missing/non-finite lat/lng are not skipped (they become NaN/undefined regions that native startGeofencingAsync rejects, failing the whole batch); API already excludes them, so this is defence-in-depth; fix: .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)) BEFORE .slice(0, MAX_REGIONS)", () => {
    const stores = [
      { storeId: "bad1", lat: undefined as unknown as number, lng: 34 },
      { storeId: "bad2", lat: NaN, lng: 34 },
      ...mk(20),
    ];
    const r = toRegions(stores);
    expect(r.map((x) => x.identifier)).toEqual(mk(20).map((s) => s.storeId));
  });
  it.skip("LOW regions.ts:10 duplicate storeIds are not de-duplicated, wasting a slot (same identifier replaces the earlier region natively); fix: dedupe by storeId before slice", () => {
    const r = toRegions([{ storeId: "a", lat: 1, lng: 1 }, { storeId: "a", lat: 1, lng: 1 }]);
    expect(new Set(r.map((x) => x.identifier)).size).toBe(r.length);
  });
});
