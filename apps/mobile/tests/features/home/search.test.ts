import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn(), BASE_URL: "https://api.grocer.test" }));
vi.mock("expo-image", () => ({ Image: { prefetch: vi.fn() } }));

import { SEARCH } from "@grocer/shared/search";
import { homeScan, homeSuggestions, suggestionTarget } from "@/features/home/search";
import { splitResults, type Product, type ProductGroup, type SearchResult } from "@/features/items/products";

const group: ProductGroup = {
  kind: "group", ref: "חלב|l", name: "חלב", measure: "l", size: 1, soldBy: "unit", type: "dairy-eggs",
  productCount: 3, storeCount: 4, minPrice: 6, refinements: [], topCodes: ["111"],
};
const product: Product = {
  kind: "product", code: "777", name: "חלב תנובה", manufacturer: null, unitQty: null, measure: "l", size: 1, storeCount: 2, type: "dairy-eggs", minPrice: 7, soldBy: "unit",
};
const results: SearchResult[] = [group, product];
const long = "ח".repeat(SEARCH.minLength);

describe("homeSuggestions", () => {
  it("shows no rows before the shared minimum length, even with results in hand", () => {
    expect(homeSuggestions("ח".repeat(SEARCH.minLength - 1), results)).toEqual({ groups: [], products: [] });
    expect(homeSuggestions("  ", results)).toEqual({ groups: [], products: [] });
  });

  it("shows the same groups and Products as the List's search, and nothing of My items", () => {
    expect(homeSuggestions(long, results)).toEqual(splitResults(results));
    expect(Object.keys(homeSuggestions(long, results)).sort()).toEqual(["groups", "products"]);
  });

  it("is empty while the search has no data", () => {
    expect(homeSuggestions(long, undefined)).toEqual({ groups: [], products: [] });
  });
});

describe("suggestionTarget", () => {
  it("opens a group's Group page and a Product's Product page", () => {
    expect(suggestionTarget(group)).toEqual({ pathname: "/group/[ref]", params: { ref: "חלב|l", type: "dairy-eggs" } });
    expect(suggestionTarget(product)).toEqual({ pathname: "/product/[code]", params: { code: "777", type: "dairy-eggs" } });
  });
});

describe("homeScan", () => {
  const scanned = { code: "777", name: "חלב תנובה", measure: "l", size: 1, soldBy: "unit", type: "dairy-eggs" } as const;

  it("opens the Product page of a found Barcode", () => {
    expect(homeScan({ kind: "found", product: scanned, action: "add" })).toEqual({
      go: "push",
      target: { pathname: "/product/[code]", params: { code: "777", type: "dairy-eggs" } },
    });
  });

  it("fills the field with a name only Open Food Facts knows, cut to the search limit", () => {
    expect(homeScan({ kind: "named", name: "במבה" })).toEqual({ go: "fill", query: "במבה" });
    expect(homeScan({ kind: "named", name: "ח".repeat(SEARCH.maxLength + 5) })).toEqual({ go: "fill", query: "ח".repeat(SEARCH.maxLength) });
  });

  it("keeps reading on an unknown Barcode", () => {
    expect(homeScan({ kind: "unknown" })).toEqual({ go: "read" });
  });
});
