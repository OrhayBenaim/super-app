// npm run geocode: fills stores.lat/lng from Nominatim, 1 request/s (Nominatim usage policy).
import { pathToFileURL } from "node:url";

const base = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";

// shortcut: a numeric City is a CBS locality code we do not decode yet, so it is left out of the query.
export function nominatimUrl(address: string, city: string) {
  const q = [address, /^\d+$/.test(city) ? "" : city, "Israel"].filter(Boolean).join(", ");
  return `${base.replace(/\/$/, "")}/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
}

export function parseNominatim(json: unknown): { lat: number; lng: number } | null {
  const hit = Array.isArray(json) ? json[0] : undefined;
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  return hit && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

async function main() {
  const { db } = await import("../db/index.js");
  const rows = db.$client.prepare("SELECT id, address, city FROM stores WHERE lat IS NULL OR lng IS NULL").all() as {
    id: string;
    address: string;
    city: string;
  }[];
  const update = db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE id = ?");
  let found = 0;
  for (const [i, s] of rows.entries()) {
    const started = Date.now();
    const res = await fetch(nominatimUrl(s.address, s.city), { headers: { "User-Agent": "grocer-api/0.1 (store geocoding)" } });
    const hit = res.ok ? parseNominatim(await res.json()) : null;
    if (hit) {
      update.run(hit.lat, hit.lng, s.id);
      found++;
    }
    console.log(`${i + 1}/${rows.length} ${s.id} ${hit ? `${hit.lat},${hit.lng}` : `not found (HTTP ${res.status})`}`);
    await new Promise((r) => setTimeout(r, Math.max(0, 1000 - (Date.now() - started))));
  }
  console.log(`geocoded ${found}/${rows.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
