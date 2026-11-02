const TIMEOUT_MS = 8_000;
const USER_AGENT = "Grocer/1.0 (https://github.com/OrhayBenaim/super-app)";

/** fetch that gives up after TIMEOUT_MS and answers null instead of throwing. */
async function get(url: string, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Product image for a product code: Rami Levy's image server, then Open Food Facts, by barcode only.
 * Chain-only codes (`<chainId>:<ItemCode>`) have no barcode. Never throws: any failure means no image (null).
 */
export async function lookupProductImage(code: string): Promise<string | null> {
  if (code.includes(":")) return null;
  const rami = `https://img.rami-levy.co.il/product/${encodeURIComponent(code)}/small.jpg`;
  // A missing product answers 403; HEAD so the bytes are downloaded once, by the image cache.
  if ((await get(rami, { method: "HEAD" }))?.status === 200) return rami;
  const res = await get(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=image_front_url`, {
    headers: { "User-Agent": USER_AGENT },
  });
  const url = await res
    ?.json()
    .then((body) => body?.product?.image_front_url)
    .catch(() => null);
  return typeof url === "string" && url ? url : null;
}
