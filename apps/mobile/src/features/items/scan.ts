import { fetchOrNull, hasImageSource, USER_AGENT } from "@grocer/shared/product-image";
import type { Item } from "@/features/lists/api";
import { api } from "@/lib/api";
import type { Product, SearchResult } from "./products";

/** The Product a Barcode found: what the scan sheet shows. */
export type ScannedProduct = Pick<Product, "code" | "name" | "measure" | "size" | "soldBy"> & { hasImage: boolean };

/** What one scanned Barcode does to the add box. */
export type ScanOutcome =
  /** Grocer knows the Product. Nothing is added until the User taps Add; `action` says what Add does. */
  | { kind: "found"; product: ScannedProduct; action: "add" }
  /** An Item matched to the Product is checked off or off the List: Add puts it back with its Quantity. */
  | { kind: "found"; product: ScannedProduct; action: "return"; item: Item }
  /** An Item matched to the Product is on the List and not checked off: the button only closes the sheet. */
  | { kind: "found"; product: ScannedProduct; action: "onList"; item: Item }
  /** Grocer doesn't know the Barcode; Open Food Facts gave this Hebrew name for the add box. */
  | { kind: "named"; name: string }
  | { kind: "unknown" };

/**
 * Resolves a Barcode the camera read against Grocer's Product search and the Items the add box sees. Leading 0s are
 * dropped: stored Barcodes never start with 0, and iOS reads a UPC-A as 13 digits. Found only on an exact code match a
 * store prices, never its Product group. Throws when the search fails.
 */
export async function resolveScan(read: string, items: Item[]): Promise<ScanOutcome> {
  const code = read.replace(/^0+/, "");
  if (!code) return { kind: "unknown" };
  const results = await api<SearchResult[]>(`api/products/search?q=${encodeURIComponent(code)}`);
  const match = results.find((r): r is Product => r.kind === "product" && r.code === code);
  if (!match) return named(read);
  const product: ScannedProduct = { code, name: match.name, measure: match.measure, size: match.size, soldBy: match.soldBy, hasImage: hasImageSource(code) };
  const item = items.find((i) => i.productCode === code);
  if (!item) return { kind: "found", product, action: "add" };
  return { kind: "found", product, action: item.missing ? "onList" : "return", item };
}

/** The Hebrew name Open Food Facts gives the Barcode as read, else unknown; a failure or 8s timeout is unknown too. */
async function named(read: string): Promise<ScanOutcome> {
  const name = await fetchOrNull(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(read)}.json?fields=product_name_he,product_name`,
    { headers: { "User-Agent": USER_AGENT } },
    async (res) => hebrewName((await res.json())?.product),
  );
  return name ? { kind: "named", name } : { kind: "unknown" };
}

/** `product_name_he`, else `product_name` only when it has Hebrew letters: the add box never gets a foreign name. */
function hebrewName(product?: { product_name_he?: unknown; product_name?: unknown }): string | null {
  const he = typeof product?.product_name_he === "string" ? product.product_name_he.trim() : "";
  const fallback = typeof product?.product_name === "string" ? product.product_name.trim() : "";
  return he || (/[א-ת]/.test(fallback) ? fallback : null);
}

/** What the scan sheet hands back when it closes: a Product to add or put back, or a name for the add box. */
export type ScanFound = Extract<ScanOutcome, { kind: "named" | "found" }>;

// The scan sheet closes before a Toast could show, so it hands what it found to the add box it returns to.
let pending: ScanFound | null = null;

export const handScan = (found: ScanFound) => {
  pending = found;
};

export function takeScan(): ScanFound | null {
  const found = pending;
  pending = null;
  return found;
}
