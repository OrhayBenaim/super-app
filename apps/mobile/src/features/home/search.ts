// What Home's search field suggests and what a tap opens. Pure (no RN imports) so vitest can load it.
import { SEARCH } from "@grocer/shared/search";
import { splitResults, type Product, type ProductGroup, type SearchResult } from "@/features/items/products";
import type { ScanOutcome } from "@/features/items/scan";
import { pageTarget } from "./card";

/** The List's search results (same hook, same route) as rows: none before SEARCH.minLength letters, and no My items. */
export const homeSuggestions = (query: string, results: SearchResult[] | undefined) =>
  splitResults(query.trim().length >= SEARCH.minLength ? results : []);

/** The search row that takes the List's "create" row's place: the query to search for, or null while it is too short. */
export const searchRow = (query: string) => (query.trim().length >= SEARCH.minLength ? query.trim() : null);

/** The row and Return both open Search results with the query. */
export const resultsTarget = (query: string) => ({ pathname: "/search", params: { q: query.trim() } }) as const;

/** What a scan from Home does with each outcome: a found Barcode opens its Product page, a name fills the field, an unknown Barcode keeps the camera reading. */
export const homeScan = (outcome: ScanOutcome) =>
  outcome.kind === "found"
    ? ({ go: "push", target: pageTarget(outcome.product.type, { code: outcome.product.code }) } as const)
    : outcome.kind === "named"
      ? ({ go: "fill", query: outcome.name.slice(0, SEARCH.maxLength) } as const)
      : ({ go: "read" } as const);

/** A suggestion opens its page and adds nothing to the List: a group its Group page, a Product its Product page. */
export const suggestionTarget = (row: ProductGroup | Product) => pageTarget(row.type, row.kind === "group" ? { ref: row.ref } : { code: row.code });

/** Names a set of Search results so the grid replays its enter motion when they change; null while there are none. */
export const resultsKey = (keys: string[]) => (keys.length ? keys.join("|") : null);
