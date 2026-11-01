// npm run geocode [-- --chain <key>]: fills stores.lat/lng from Nominatim, 1 request/s (Nominatim usage policy).
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { chainSeeds } from "./chains.js";

const base = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";


// City arrives decoded by parseStores; a code still numeric is one we cannot name, so it counts as empty. Without a city
// the store name usually carries the locality (Yohananof publishes City=0 for all 51 stores). Null = nothing to look up.
export function nominatimUrl(address: string, city: string, name = "") {
  const town = /^\d+$/.test(city) ? "" : city;
  const street = address.replace(/,(?=\d)/g, " "); // "האומן,15"
  const place = town ? (street.includes(town) ? "" : town) : name;
  const q = [street, place].filter(Boolean).join(", ");
  return q ? `${base.replace(/\/$/, "")}/search?format=json&limit=1&q=${encodeURIComponent(`${q}, Israel`)}` : null;
}

export function parseNominatim(json: unknown): { lat: number; lng: number } | null {
  const hit = Array.isArray(json) ? json[0] : undefined;
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  return hit && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

async function main() {
  const { values } = parseArgs({ options: { chain: { type: "string" } } });
  const chainId = values.chain ? chainSeeds.find((c) => c.key === values.chain)?.ids[0] : undefined;
  if (values.chain && !chainId) throw new Error(`unknown chain "${values.chain}"`);
  const { db } = await import("../db/index.js");
  const rows = db.$client
    .prepare("SELECT id, address, city, name FROM stores WHERE (lat IS NULL OR lng IS NULL) AND (? IS NULL OR chain_id = ?)")
    .all(chainId ?? null, chainId ?? null) as {
    id: string;
    address: string;
    city: string;
    name: string;
  }[];
  const update = db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE id = ?");
  let found = 0;
  for (const [i, s] of rows.entries()) {
    const url = nominatimUrl(s.address, s.city, s.name);
    if (!url) {
      console.log(`${i + 1}/${rows.length} ${s.id} skipped (no address, city or name)`);
      continue;
    }
    const started = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": "grocer-dev (contact: dev@example.com)" } });
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
