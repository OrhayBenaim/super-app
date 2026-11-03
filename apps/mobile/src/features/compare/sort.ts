// Pure (no RN imports) so vitest can load it. Types mirror docs/api.md.
export type Sort = "price" | "distance" | "coverage";
type Line = { code: string; price: number; quantity: number; lineTotal: number };
export type StoreResult = {
  storeId: string; chainId: string; chainName: string; storeName: string; address: string; city: string;
  lat: number; lng: number; distanceKm: number; total: number; matched: number;
  /** Codes and Product group refs this store does not carry. */
  missingCodes: string[];
  /**
   * One per priced code or group: `price` is per one of `quantity` (per kilo when sold by weight), `lineTotal` their
   * product. A group line names the product its price comes from (unitPrice per kilo or liter).
   */
  items: (Line | (Line & { ref: string; name: string; size: number; unitPrice?: number }))[];
  orderUrl: string | null;
};
export type CompareResponse = { stores: StoreResult[]; unmatched: string[] };

// Same order as the API (routes/prices.ts), so a client re-sort matches a server sort.
// Non-finite numbers (bad price data) sort last; equal values return 0 so Infinity - Infinity never yields NaN.
const fin = (n: number) => (Number.isFinite(n) ? n : Infinity);
const diff = (x: number, y: number) => (fin(x) === fin(y) ? 0 : fin(x) - fin(y));
const order: Record<Sort, (a: StoreResult, b: StoreResult) => number> = {
  price: (a, b) => a.missingCodes.length - b.missingCodes.length || diff(a.total, b.total),
  distance: (a, b) => diff(a.distanceKm, b.distanceKm),
  coverage: (a, b) => b.matched - a.matched || diff(a.total, b.total),
};

export const sortStores = (stores: StoreResult[], sort: Sort) =>
  [...stores].sort((a, b) => order[sort](a, b) || diff(a.distanceKm, b.distanceKm));

/** Compare's accordion: the open store (else the first) as the card, and the sorted stores above and below it. */
export function openSplit(sorted: StoreResult[], openId: string | null) {
  const at = Math.max(0, sorted.findIndex((s) => s.storeId === openId));
  return { open: sorted[at], above: sorted.slice(0, at), below: sorted.slice(at + 1) };
}

/**
 * The green "₪x less than <chain>" line for the cheapest store: only against the next store with the same
 * coverage (otherwise the totals price different baskets), and only when it is actually cheaper.
 */
export function saving(stores: StoreResult[]): { amount: number; chainName: string } | null {
  const [best, ...rest] = sortStores(stores, "price");
  const next = best && rest.find((s) => s.matched === best.matched && Number.isFinite(s.total));
  if (!next || !Number.isFinite(best.total)) return null;
  const amount = Math.round((next.total - best.total) * 100) / 100;
  return amount > 0 ? { amount, chainName: next.chainName } : null;
}
