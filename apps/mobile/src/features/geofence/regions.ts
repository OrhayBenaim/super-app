// Pure (type-only imports) so vitest can load it.
import type { LocationRegion } from "expo-location";
import type { StoreResult } from "@/features/compare/sort";

export const GEOFENCE_TASK = "grocer-geofence";
export const MAX_REGIONS = 20; // iOS monitors at most 20 regions per app
export const REGION_RADIUS_M = 250;

export const toRegions = (stores: Pick<StoreResult, "storeId" | "lat" | "lng">[]): LocationRegion[] =>
  stores.slice(0, MAX_REGIONS).map((s) => ({
    identifier: s.storeId,
    latitude: s.lat,
    longitude: s.lng,
    radius: REGION_RADIUS_M,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));
