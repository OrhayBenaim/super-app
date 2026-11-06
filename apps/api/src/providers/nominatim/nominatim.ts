import type { Geocoder, LatLng } from "#/services/geocoder.ts";

// City arrives decoded by parseStores; a code still numeric is one we cannot name, so it counts as empty. Without a city
// the store name usually carries the locality (Yohananof publishes City=0 for all 51 stores). Null = nothing to look up.
export function nominatimUrl(base: string, address: string, city: string, name = "") {
  const town = /^\d+$/.test(city) ? "" : city;
  // "האומן,15" and "מלצר20"; OSM names streets without "רחוב"/"שדרות"/"דרך", and Nominatim finds nothing when the query keeps them.
  const street = address.replace(/,(?=\d)/g, " ").replace(/([א-ת])(?=\d)/g, "$1 ").replace(/^\s*(?:(?:רחוב|רח|שדרות|שד|דרך)\s+|(?:רח|שד)['׳`.]\s*)/, "");
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

// Public Nominatim answers 403 "Access denied" to a placeholder contact (dev@example.com); a real project URL passes (2026-11-01).
const USER_AGENT = "Grocer/0.1 (+https://github.com/OrhayBenaim/super-app)";

/** At most 1 request per second (Nominatim usage policy). */
export function nominatimGeocoder(base: string): Geocoder {
  let last = 0;
  return {
    async geocode({ address, city, name }) {
      const url = nominatimUrl(base, address, city, name);
      if (!url) return null;
      await new Promise((r) => setTimeout(r, Math.max(0, last + 1000 - Date.now())));
      last = Date.now();
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`nominatim: HTTP ${res.status}`);
      return parseNominatim(await res.json());
    },
  };
}
