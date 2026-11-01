import type { Geocoder, LatLng } from "#/services/geocoder.ts";

// City arrives decoded by parseStores; a code still numeric is one we cannot name, so it counts as empty. Without a city
// the store name usually carries the locality (Yohananof publishes City=0 for all 51 stores). Null = nothing to look up.
export function nominatimUrl(base: string, address: string, city: string, name = "") {
  const town = /^\d+$/.test(city) ? "" : city;
  const street = address.replace(/,(?=\d)/g, " "); // "האומן,15"
  const place = town ? (street.includes(town) ? "" : town) : name;
  const q = [street, place].filter(Boolean).join(", ");
  return q ? `${base.replace(/\/$/, "")}/search?format=json&limit=1&q=${encodeURIComponent(`${q}, Israel`)}` : null;
}

export function parseNominatim(json: unknown): LatLng | null {
  const hit = Array.isArray(json) ? json[0] : undefined;
  const lat = parseFloat(hit?.lat); // Number(null) and Number("") are 0, which would geocode a store to the Gulf of Guinea
  const lng = parseFloat(hit?.lon);
  return hit && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** At most 1 request per second (Nominatim usage policy). */
export function nominatimGeocoder(base: string): Geocoder {
  let last = 0;
  return {
    async geocode({ address, city, name }) {
      const url = nominatimUrl(base, address, city, name);
      if (!url) return null;
      await new Promise((r) => setTimeout(r, Math.max(0, last + 1000 - Date.now())));
      last = Date.now();
      const res = await fetch(url, { headers: { "User-Agent": "grocer-dev (contact: dev@example.com)" } });
      if (!res.ok) throw new Error(`nominatim: HTTP ${res.status}`);
      return parseNominatim(await res.json());
    },
  };
}
