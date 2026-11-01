import type { Geocoder, LatLng, Place } from "#/services/geocoder.ts";

export function fakeGeocoder(lookup: (place: Place) => LatLng | null = () => null) {
  const calls: Place[] = [];
  const fake = {
    calls,
    async geocode(place: Place) {
      calls.push(place);
      return lookup(place);
    },
  };
  return fake satisfies Geocoder;
}
