import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ Events: {}, track: vi.fn() }));
vi.mock("@/lib/strings", () => ({ t: (k: string) => k }));

import { breakdown, missingCount } from "@/features/compare/breakdown";
import type { StoreResult } from "@/features/compare/sort";
import type { Item } from "@/features/lists/api";

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, listId: "l", name: id, category: "c", productCode: null, groupRef: null, missing: true, quantity: 1, soldBy: "unit", createdAt: "", updatedAt: "", ...over,
});
const store = (items: StoreResult["items"], _missingCodes: string[] = []) => ({ items });

describe("breakdown", () => {
  it("prices each item at quantity × the store's unit price, product and group lines alike", () => {
    const milk = item("milk", { productCode: "111", quantity: 2 });
    const banana = item("banana", { groupRef: "בננה|kg", quantity: 1.5, soldBy: "weight" });
    const s = store([
      { code: "111", price: 6.9, quantity: 2, lineTotal: 13.8 },
      { ref: "בננה|kg", code: "555", name: "בננה", size: 1, unitPrice: 9.9, price: 9.9, quantity: 1.5, lineTotal: 14.85 },
    ]);
    expect(breakdown([milk, banana], s).priced).toEqual([
      { item: milk, price: 6.9, lineTotal: 13.8 },
      { item: banana, price: 9.9, lineTotal: 14.85 },
    ]);
  });

  it("splits a merged line back into one line per item", () => {
    const a = item("a", { productCode: "111", quantity: 1 });
    const b = item("b", { productCode: "111", quantity: 3 });
    const { priced } = breakdown([a, b], store([{ code: "111", price: 5, quantity: 4, lineTotal: 20 }]));
    expect(priced.map((p) => p.lineTotal)).toEqual([5, 15]);
  });

  it("never prices a product item by a group line that happens to name the same product", () => {
    const p = item("p", { productCode: "555" });
    const r = breakdown([p], store([{ ref: "בננה|kg", code: "555", name: "בננה", size: 1, price: 9.9, quantity: 1, lineTotal: 9.9 }], ["555"]));
    expect(r.priced).toEqual([]);
    expect(r.notHere).toEqual([p]);
  });

  it("lists items the store does not price, then unmatched items", () => {
    const here = item("here", { productCode: "1" });
    const gone = item("gone", { productCode: "2" });
    const none = item("none");
    const r = breakdown([none, here, gone], store([{ code: "1", price: 1, quantity: 1, lineTotal: 1 }], ["2"]));
    expect(r).toEqual({ priced: [{ item: here, price: 1, lineTotal: 1 }], notHere: [gone], unmatched: [none] });
  });
});

describe("missingCount", () => {
  it("counts List items, so two items matched to one priced product are both priced", () => {
    const a = item("a", { productCode: "111" });
    const b = item("b", { productCode: "111" });
    expect(missingCount([a, b], store([{ code: "111", price: 5, quantity: 2, lineTotal: 10 }]))).toBe(0);
  });

  it("counts items the store doesn't price and unmatched items", () => {
    const items = [item("a", { productCode: "1" }), item("b", { productCode: "2" }), item("c")];
    expect(missingCount(items, store([{ code: "1", price: 1, quantity: 1, lineTotal: 1 }]))).toBe(2);
  });
});
