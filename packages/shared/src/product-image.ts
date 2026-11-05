const TIMEOUT_MS = 8_000;
const USER_AGENT = "Grocer/1.0 (https://github.com/OrhayBenaim/super-app)";
/** How many codes' answers stay in memory: the most recently asked ones. */
const CACHE_SIZE = 2_000;
/** Answers by code, oldest first; a pending lookup sits here too, so concurrent calls share it. */
const cache = new Map<string, Promise<string | null>>();

/** Chain-only codes (`<chainId>:<ItemCode>`, see the API's ingest) have no barcode, so no Product image. */
export const hasBarcode = (code: string | null): code is string => !!code && !code.includes(":");

/** Fetches `url` and reads the reply with `read`, giving up after TIMEOUT_MS. Any failure answers null, never throws. */
async function fetchOrNull<T>(url: string, init: RequestInit, read: (res: Response) => Promise<T>): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await read(await fetch(url, { ...init, signal: ctrl.signal }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Product image URL for a product code: Rami Levy's image server, then Open Food Facts, by barcode only.
 * Null when there is none. Each code is looked up once while it stays among the CACHE_SIZE most recent. Never throws.
 */
export function lookupProductImage(code: string): Promise<string | null> {
  if (!hasBarcode(code)) return Promise.resolve(null);
  const answer = cache.get(code) ?? lookup(code);
  cache.delete(code);
  cache.set(code, answer);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return answer;
}

async function lookup(code: string): Promise<string | null> {
  const rami = `https://img.rami-levy.co.il/product/${encodeURIComponent(code)}/small.jpg`;
  // A missing product answers 403; HEAD so the bytes are downloaded once, by the image cache.
  if (await fetchOrNull(rami, { method: "HEAD" }, async (res) => res.status === 200)) return rami;
  const url = await fetchOrNull(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=image_front_url`,
    { headers: { "User-Agent": USER_AGENT } },
    async (res) => (await res.json())?.product?.image_front_url,
  );
  return typeof url === "string" && url ? url : null;
}
