// Nearby: the stores within Compare's radius of the User. Stores without coordinates are never nearby.
import type { Db } from "#/db/index.ts";

export type Near = { lat: number; lng: number; radiusKm: number };

const R = 6371;
const KM_PER_DEG = 111; // below R*pi/180 = 111.195 so the bounding box always contains the circle
const rad = (d: number) => (d * Math.PI) / 180;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** The [minLat, maxLat, minLng, maxLng] box around the circle, for the stores_lat_lng index; check haversineKm after. */
function boundingBox({ lat, lng, radiusKm }: Near) {
  const dLat = radiusKm / KM_PER_DEG;
  const dLng = radiusKm / (KM_PER_DEG * Math.max(Math.cos(rad(lat)), 0.01));
  return [lat - dLat, lat + dLat, lng - dLng, lng + dLng] as const;
}

/** The stores within `radiusKm` and how far each is, nearest first. */
export function nearbyStores(db: Db, near: Near): { id: string; km: number }[] {
  const rows = db.$client
    .prepare("SELECT id, lat, lng FROM stores WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?")
    .all(...boundingBox(near)) as { id: string; lat: number; lng: number }[];
  return rows
    .map((s) => ({ id: s.id, km: haversineKm(near.lat, near.lng, s.lat, s.lng) }))
    .filter((s) => s.km <= near.radiusKm)
    .sort((a, b) => a.km - b.km);
}

/** Ids of the stores within `radiusKm`, nearest first. */
export const nearbyStoreIds = (db: Db, near: Near) => nearbyStores(db, near).map((s) => s.id);
