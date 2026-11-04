import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("expo-image", () => ({ Image: { prefetch: vi.fn() } }));

import { firstImage, splitResults, type SearchResult } from "@/features/items/products";

const g = (ref: string) => ({ kind: "group", ref, name: ref, measure: "kg", size: 1, soldBy: "unit", productCount: 2, storeCount: 1, minPrice: 1, refinements: [], topCodes: [] }) as SearchResult;
const p = (code: string) => ({ kind: "product", code, name: code, manufacturer: null, unitQty: null, measure: null, size: null, soldBy: "unit", storeCount: 1, minPrice: 1 }) as SearchResult;

describe("splitResults", () => {
  it("separates group rows from products, keeping order", () => {
    const { groups, products } = splitResults([g("a|kg"), g("b|unit|12"), p("1"), p("2")]);
    expect(groups.map((r) => r.ref)).toEqual(["a|kg", "b|unit|12"]);
    expect(products.map((r) => r.code)).toEqual(["1", "2"]);
  });

  it("handles no results", () => {
    expect(splitResults()).toEqual({ groups: [], products: [] });
    expect(splitResults([])).toEqual({ groups: [], products: [] });
  });
});

describe("firstImage", () => {
  it("tries codes in order and stops at the first with an image, skipping chain-only codes", async () => {
    const lookup = vi.fn(async (code: string) => (code === "222" ? "https://img/222.jpg" : null));
    expect(await firstImage(["111", "7290:9", "222", "333"], lookup)).toBe("https://img/222.jpg");
    expect(lookup.mock.calls.map(([c]) => c)).toEqual(["111", "222"]);
  });

  it("is null when no code has an image", async () => {
    expect(await firstImage(["111", "7290:9"], async () => null)).toBeNull();
    expect(await firstImage([], async () => "x")).toBeNull();
  });
});
