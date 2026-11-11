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
  if (!found) return { kind: "unknown" };
  const item = items.find((i) => i.productCode === code);
  if (item) return { kind: item.missing ? "alreadyOnList" : "returned", item };
  return { kind: "added", product: { code, name: found.name } };
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
