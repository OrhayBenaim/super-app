export type Place = { address: string; city: string; name: string };
export type LatLng = { lat: number; lng: number };

/** Turns a store's address into coordinates. Null when the place is not found. */
export interface Geocoder {
  geocode(place: Place): Promise<LatLng | null>;
}
