import { fetchOrNull, USER_AGENT } from "@grocer/shared/product-image";
import type { Item } from "@/features/lists/api";
import { api } from "@/lib/api";
import type { SearchResult } from "./products";

/** What one scanned Barcode does to the add box. */
export type ScanOutcome =
  /** Add this Product, as tapping its search result does. */
  | { kind: "added"; product: { code: string; name: string } }
  /** Put this Item, matched to the Product but checked off or off the List, back on the List. */
  | { kind: "returned"; item: Item }
  /** This Item is matched to the Product and already on the List. */
  | { kind: "alreadyOnList"; item: Item }
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
  const found = results.find((r) => r.kind === "product" && r.code === code);
  if (!found) return named(read);
  const item = items.find((i) => i.productCode === code);
  if (item) return { kind: item.missing ? "alreadyOnList" : "returned", item };
  return { kind: "added", product: { code, name: found.name } };
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

/** An outcome that closes the scan sheet. */
export type ScanFound = Exclude<ScanOutcome, { kind: "unknown" }>;

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
