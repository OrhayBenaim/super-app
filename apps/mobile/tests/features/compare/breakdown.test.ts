import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItem: () => null, setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
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
      { item: milk, price: 6.9, lineTotal: 13.8, shelfTotal: 13.8 },
      { item: banana, price: 9.9, lineTotal: 14.85, shelfTotal: 14.85 },
    ]);
  });

  it("splits a merged line back into one line per item", () => {
    const a = item("a", { productCode: "111", quantity: 1 });
    const b = item("b", { productCode: "111", quantity: 3 });
    const { priced } = breakdown([a, b], store([{ code: "111", price: 5, quantity: 4, lineTotal: 20 }]));
    expect(priced.map((p) => p.lineTotal)).toEqual([5, 15]);
  });

  it("takes a bundle Promotion line's total as is and keeps the Shelf total struck", () => {
    const promotion = { id: "p1", kind: "bundle" as const, minQty: 3, amount: 10, audience: "all" as const, text: "3 ב-10" };
    const x = item("x", { productCode: "111", quantity: 3 });
    const { priced } = breakdown([x], store([{ code: "111", price: 5.9, quantity: 3, lineTotal: 10, promotion }]));
    expect(priced).toEqual([{ item: x, price: 5.9, lineTotal: 10, shelfTotal: 17.7, promotion }]);
    expect(priced[0].promotion).toBe(promotion);
  });

  it("uses the response's lineTotal even when it differs from price × quantity", () => {
    const x = item("x", { productCode: "111", quantity: 2 });
    expect(breakdown([x], store([{ code: "111", price: 4, quantity: 2, lineTotal: 7 }])).priced[0]).toMatchObject({ lineTotal: 7, shelfTotal: 8 });
  });

  it("splits a merged Promotion line by quantity, remainder on the last item, summing exactly", () => {
    const promotion = { id: "p1", kind: "price" as const, minQty: 1, amount: 3.5, audience: "all" as const, text: "" };
    const a = item("a", { productCode: "111", quantity: 1 });
    const b = item("b", { productCode: "111", quantity: 2 });
    const r = breakdown([a, b], store([{ code: "111", price: 5, quantity: 3, lineTotal: 10, promotion }])).priced;
    expect(r.map((p) => p.lineTotal)).toEqual([3.33, 6.67]);
    expect(r.map((p) => p.shelfTotal)).toEqual([5, 10]);
    expect(r.every((p) => p.promotion === promotion)).toBe(true);

    const three = ["a", "b", "c"].map((id) => item(id, { productCode: "111", quantity: 1 }));
    const t3 = breakdown(three, store([{ code: "111", price: 5, quantity: 3, lineTotal: 10 }])).priced;
    expect(t3.map((p) => p.lineTotal)).toEqual([3.33, 3.33, 3.34]);
    expect(t3.every((p) => p.promotion === undefined)).toBe(true);
  });

  it("splits a group line's total too", () => {
    const a = item("a", { groupRef: "g|kg", quantity: 1 });
    const b = item("b", { groupRef: "g|kg", quantity: 1 });
    const line = { ref: "g|kg", code: "5", name: "g", size: 1, price: 5, quantity: 2, lineTotal: 9 };
    expect(breakdown([a, b], store([line])).priced.map((p) => p.lineTotal)).toEqual([4.5, 4.5]);
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
    expect(r).toEqual({ priced: [{ item: here, price: 1, lineTotal: 1, shelfTotal: 1 }], notHere: [gone], unmatched: [none] });
  });

  it("passes a Restricted promotion through with its audience as sent", () => {
    const promotion = { id: "p1", kind: "percent" as const, minQty: 1, amount: 20, audience: "club" as const, text: "" };
    const x = item("x", { productCode: "111" });
    const [p] = breakdown([x], store([{ code: "111", price: 10, quantity: 1, lineTotal: 8, promotion }])).priced;
    expect(p.promotion).toBe(promotion);
    expect(p.promotion?.audience).toBe("club");
    expect(p.partners).toBeUndefined();
  });

  it("passes hints through on a line with no promotion", () => {
    const hints = [{ id: "h1", kind: "bundle" as const, minQty: 3, amount: 10, audience: "all" as const, text: "" }];
    const x = item("x", { productCode: "111" });
    const [p] = breakdown([x], store([{ code: "111", price: 5.9, quantity: 1, lineTotal: 5.9, hints }])).priced;
    expect(p.hints).toEqual(hints);
    expect(p.promotion).toBeUndefined();
    expect(p.info).toBeUndefined();
  });

  it("passes info through", () => {
    const info = [{ id: "i1", description: "מבצע מיוחד" }];
    const x = item("x", { productCode: "111" });
    const [p] = breakdown([x], store([{ code: "111", price: 5, quantity: 1, lineTotal: 5, info }])).priced;
    expect(p.info).toEqual(info);
    expect(p.hints).toBeUndefined();
    expect(p.promotion).toBeUndefined();
  });

  it("names the partners of a mix-and-match Promotion, each with its own totals", () => {
    const promotion = { id: "p9", kind: "bundle" as const, minQty: 2, amount: 8, audience: "all" as const, text: "" };
    const a = item("a", { productCode: "111" });
    const b = item("b", { productCode: "222" });
    const c = item("c", { productCode: "333" });
    const other = { id: "p10", kind: "percent" as const, minQty: 1, amount: 10, audience: "all" as const, text: "" };
    const { priced } = breakdown([a, b, c], store([
      { code: "111", price: 5.9, quantity: 1, lineTotal: 4.37, promotion },
      { code: "222", price: 4.9, quantity: 1, lineTotal: 3.63, promotion },
      { code: "333", price: 3, quantity: 1, lineTotal: 2.7, promotion: other },
    ]));
    expect(priced[0]).toMatchObject({ lineTotal: 4.37, shelfTotal: 5.9, partners: ["b"] });
    expect(priced[1]).toMatchObject({ lineTotal: 3.63, shelfTotal: 4.9, partners: ["a"] });
    expect(priced[2].partners).toBeUndefined();
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
