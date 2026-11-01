// Pure (no RN imports) so vitest can load it. Types mirror docs/api.md.
export type Sort = "price" | "distance" | "coverage";
export type StoreResult = {
  storeId: string; chainId: string; chainName: string; storeName: string; address: string; city: string;
  lat: number; lng: number; distanceKm: number; total: number; matched: number;
  missingCodes: string[]; items: { code: string; price: number }[]; orderUrl: string | null;
};
export type CompareResponse = { stores: StoreResult[]; unmatched: string[] };

// Same order as the API (routes/prices.ts), so a client re-sort matches a server sort.
const order: Record<Sort, (a: StoreResult, b: StoreResult) => number> = {
  price: (a, b) => a.missingCodes.length - b.missingCodes.length || a.total - b.total,
  distance: (a, b) => a.distanceKm - b.distanceKm,
  coverage: (a, b) => b.matched - a.matched || a.total - b.total,
};

export const sortStores = (stores: StoreResult[], sort: Sort) =>
  [...stores].sort((a, b) => order[sort](a, b) || a.distanceKm - b.distanceKm);
