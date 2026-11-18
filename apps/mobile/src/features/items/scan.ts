import { fetchOrNull, USER_AGENT } from "@grocer/shared/product-image";
import type { Item } from "@/features/lists/api";
import { COMPARE_LIMIT, fetchCompare } from "@/features/compare/api";
import { fmt, navigateLabel, shekels } from "@/features/compare/format";
import { promotionText } from "@/features/compare/promotion";
import { sortStores, type StoreResult } from "@/features/compare/sort";
import { api } from "@/lib/api";
import type { Coords } from "@/lib/location";
import { t } from "@/lib/strings";
import type { Product, SearchResult } from "./products";

/** The Product a Barcode found: what the scan sheet shows. */
export type ScannedProduct = Pick<Product, "code" | "name" | "measure" | "size" | "soldBy" | "type">;

/** One store pricing the scanned Product. `price` is the Shelf price (per kilo when Sold by weight); `promo` is set only when a Promotion lowers the price of one. */
export type ScanStore = Pick<StoreResult, "chainName" | "storeName" | "distanceKm" | "lat" | "lng"> & {
  price: number;
  promo?: { price: number; text: string };
};

/** What a store charges for the scanned Product: the Promotion price when there is one, else the Shelf price. */
export const shownPrice = (s: ScanStore) => s.promo?.price ?? s.price;

/** What the scan shows under the Product: the cheapest store (ties: the nearer) and the others in price order, or why there are no prices. */
export type ScanPrices = { kind: "stores"; headline: ScanStore; others: ScanStore[] } | { kind: "none" } | { kind: "noLocation" } | { kind: "failed" };

/** Where the User is and how far Compare looks; null when location is off. */
export type ScanWhere = (Coords & { radiusKm: number }) | null;

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
 * store prices, never its Product group. Throws when the search fails. Its prices come after, from `pricesNearby`.
 */
export async function resolveScan(read: string, items: Item[]): Promise<ScanOutcome> {
  const code = read.replace(/^0+/, "");
  if (!code) return { kind: "unknown" };
  const results = await api<SearchResult[]>(`api/products/search?q=${encodeURIComponent(code)}`);
  const match = results.find((r): r is Product => r.kind === "product" && r.code === code);
  if (!match) return named(read);
  const product: ScannedProduct = { code, name: match.name, measure: match.measure, size: match.size, soldBy: match.soldBy, type: match.type };
  const item = items.find((i) => i.productCode === code);
  if (!item) return { kind: "found", product, action: "add" };
  return { kind: "found", product, action: item.missing ? "onList" : "return", item };
}

/** A found Product's prices: Compare on a basket of just it (Quantity 1) around `where`. A failed Compare is `failed`, never a throw. */
export async function pricesNearby(code: string, soldBy: Product["soldBy"], where: ScanWhere): Promise<ScanPrices> {
  if (!where) return { kind: "noLocation" };
  try {
    const { stores } = await fetchCompare({ lat: where.lat, lng: where.lng, radiusKm: where.radiusKm, items: [{ code, quantity: 1 }], groups: [], sort: "price", limit: COMPARE_LIMIT });
    // Compare orders by total, which is the Promotion price here, so price order and the nearer-first tie-break hold.
    const priced = sortStores(stores, "price").flatMap((s): ScanStore[] => {
      const line = s.items.find((l) => l.code === code);
      if (!line) return [];
      const base = { chainName: s.chainName, storeName: s.storeName, distanceKm: s.distanceKm, lat: s.lat, lng: s.lng, price: line.price };
      return line.promotion && line.lineTotal < line.price ? [{ ...base, promo: { price: line.lineTotal, text: promotionText(line.promotion, soldBy, t) } }] : [base];
    });
    return priced.length ? { kind: "stores", headline: priced[0], others: priced.slice(1) } : { kind: "none" };
  } catch {
    return { kind: "failed" };
  }
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

/** What the scan sheet hands back when it closes: a Product to add or put back, or a name for the add box (an Item already on the List hands back nothing). */
export type ScanFound = Exclude<Extract<ScanOutcome, { kind: "named" | "found" }>, { action: "onList" }>;

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

/** What a screen reader says for a store's tap target: the Waze action, the price, and the struck Shelf price when promoted. */
export const storeLabel = (s: ScanStore) =>
  [
    navigateLabel(s, t),
    shekels(shownPrice(s)),
    s.promo && fmt(t("compare.promo.insteadOf"), { price: shekels(s.price) }),
  ].filter(Boolean).join(", ");
