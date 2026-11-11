/** The largest Product image the team may upload (docs/adr/0008), in MB as the pages say it, and in bytes. */
export const MAX_IMAGE_MB = 5;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

const TIMEOUT_MS = 8_000;
/** How Grocer names itself to Open Food Facts. */
export const USER_AGENT = "Grocer/1.0 (https://github.com/OrhayBenaim/super-app)";
/** How many codes' answers stay in memory: the most recently asked ones. */
const CACHE_SIZE = 2_000;
/** Where Rami Levy's image server keeps Product images by barcode (the dashboard names it as the source). */
export const RAMI_LEVY_IMAGES = "https://img.rami-levy.co.il/product/";
/** Answers by code, oldest first; a pending lookup sits here too, so concurrent calls share it. */
const cache = new Map<string, Promise<string | null>>();

/** Chain-only codes (`<chainId>:<ItemCode>`, see the API's ingest) have no barcode, so nothing to look up by. */
export const hasBarcode = (code: string | null): code is string => !!code && !code.includes(":");

/**
 * The Product images the Grocer team uploaded (docs/adr/0008): `versions` is the api's `GET /api/products/images` (code to
 * version), `base` where its `/products/:code/image` is served (the public api's `/api`, or the dashboard's proxy).
 */
export type UploadedImages = { base: string; versions: Readonly<Record<string, string>> };

/** The version of a code's uploaded image, undefined when it has none. */
export const uploadedVersion = (code: string, uploaded?: UploadedImages) => (uploaded && Object.hasOwn(uploaded.versions, code) ? uploaded.versions[code] : undefined);

/** Whether a code can have a Product image: an uploaded one, or a barcode to look one up by. */
export const hasImageSource = (code: string | null, uploaded?: UploadedImages): code is string =>
  !!code && (hasBarcode(code) || uploadedVersion(code, uploaded) !== undefined);

/** Fetches `url` and reads the reply with `read`, giving up after TIMEOUT_MS. Any failure answers null, never throws. */
export async function fetchOrNull<T>(url: string, init: RequestInit, read: (res: Response) => Promise<T>): Promise<T | null> {
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
 * The Product image URL for a product code: its uploaded image when it has one (the version in the URL, so a new upload
 * is a new URL for every image cache), else by barcode: Rami Levy's image server, then Open Food Facts.
 * Null when there is none. Each barcode is looked up once while it stays among the CACHE_SIZE most recent. Never throws.
 */
export function lookupProductImage(code: string, uploaded?: UploadedImages): Promise<string | null> {
  const version = uploadedVersion(code, uploaded);
  if (version !== undefined) {
    return Promise.resolve(`${uploaded!.base}/products/${encodeURIComponent(code)}/image?v=${encodeURIComponent(version)}`);
  }
  if (!hasBarcode(code)) return Promise.resolve(null);
  const answer = cache.get(code) ?? lookup(code);
  cache.delete(code);
  cache.set(code, answer);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return answer;
}

async function lookup(code: string): Promise<string | null> {
  const rami = `${RAMI_LEVY_IMAGES}${encodeURIComponent(code)}/small.jpg`;
  // A missing product answers 403; HEAD so the bytes are downloaded once, by the image cache.
  if (await fetchOrNull(rami, { method: "HEAD" }, async (res) => res.status === 200)) return rami;
  const url = await fetchOrNull(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=image_front_url`,
    { headers: { "User-Agent": USER_AGENT } },
    async (res) => (await res.json())?.product?.image_front_url,
  );
  return typeof url === "string" && url ? url : null;
}
