// Pure (no RN imports) so vitest can load it. Types mirror docs/api.md.
export type Sort = "price" | "distance" | "coverage";
export type StoreResult = {
  storeId: string; chainId: string; chainName: string; storeName: string; address: string; city: string;
  lat: number; lng: number; distanceKm: number; total: number; matched: number;
  missingCodes: string[]; items: { code: string; price: number }[]; orderUrl: string | null;
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
