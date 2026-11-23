// What Home's search field suggests and what a tap opens. Pure (no RN imports) so vitest can load it.
import { SEARCH } from "@grocer/shared/search";
import { splitResults, type Product, type ProductGroup, type SearchResult } from "@/features/items/products";

/** The List's search results (same hook, same route) as rows: none before SEARCH.minLength letters, and no My items. */
export const homeSuggestions = (query: string, results: SearchResult[] | undefined) =>
  splitResults(query.trim().length >= SEARCH.minLength ? results : []);

/** The search row that takes the List's "create" row's place: the query to search for, or null while it is too short. */
export const searchRow = (query: string) => (query.trim().length >= SEARCH.minLength ? query.trim() : null);

/** The row and Return both open Search results with the query. */
export const resultsTarget = (query: string) => ({ pathname: "/search", params: { q: query.trim() } }) as const;

/** A suggestion opens its page and adds nothing to the List: a group its Group page, a Product its Product page. */
export const suggestionTarget = (row: ProductGroup | Product) =>
  row.kind === "group"
    ? ({ pathname: "/group/[ref]", params: { ref: row.ref, type: row.type } } as const)
    : ({ pathname: "/product/[code]", params: { code: row.code, type: row.type } } as const);
