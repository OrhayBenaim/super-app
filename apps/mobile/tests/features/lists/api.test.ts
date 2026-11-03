import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ Events: {}, track: vi.fn() }));
vi.mock("@/lib/strings", () => ({ t: (k: string) => k }));
vi.mock("expo-secure-store", () => ({ getItem: () => null, setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));

import { basketSize, currentListId, matchKey, missingBasket, type Item, type ListDetail } from "@/features/lists/api";

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, listId: "l", name: id, category: "c", productCode: null, groupRef: null, missing: true, quantity: 1, soldBy: "unit", createdAt: "", updatedAt: "", ...over,
});
const detail = (items: Item[]) => ({ list: {}, members: [], items }) as unknown as ListDetail;

describe("matchKey", () => {
  it("is the product code, else the group ref, else null", () => {
    expect(matchKey(item("a", { productCode: "729" }))).toBe("729");
    expect(matchKey(item("b", { groupRef: "בורגול|kg" }))).toBe("בורגול|kg");
    expect(matchKey(item("c"))).toBeNull();
  });
});

describe("missingBasket", () => {
  it("sends missing items matched to a product as items and matched to a group as groups, each with its quantity", () => {
    const d = detail([
      item("a", { productCode: "111", quantity: 2 }),
      item("b", { groupRef: "בורגול|kg" }),
      item("c", { groupRef: "בננה|kg", quantity: 1.5, soldBy: "weight" }),
      item("d", { productCode: "222" }),
    ]);
    expect(missingBasket(d)).toEqual({
      items: [{ code: "111", quantity: 2 }, { code: "222", quantity: 1 }],
      groups: [{ ref: "בורגול|kg", quantity: 1 }, { ref: "בננה|kg", quantity: 1.5 }],
    });
  });

  it("keeps two items matched to one product as two entries (the API sums them)", () => {
    const d = detail([item("a", { productCode: "111", quantity: 2 }), item("b", { productCode: "111", quantity: 3 })]);
    expect(missingBasket(d).items).toEqual([{ code: "111", quantity: 2 }, { code: "111", quantity: 3 }]);
  });

  it("leaves out items already bought and items matched to nothing", () => {
    const d = detail([item("a", { productCode: "111", missing: false }), item("b", { groupRef: "בורגול|kg", missing: false }), item("c")]);
    expect(missingBasket(d)).toEqual({ items: [], groups: [] });
  });

  it("is empty without a list", () => {
    expect(missingBasket(undefined)).toEqual({ items: [], groups: [] });
  });
});

describe("basketSize", () => {
  it("counts items and groups together", () => {
    const one = (code: string) => ({ code, quantity: 1 });
    expect(basketSize({ items: [], groups: [] })).toBe(0);
    expect(basketSize({ items: [one("1"), one("2")], groups: [{ ref: "g|kg", quantity: 2 }] })).toBe(3);
    expect(basketSize({ items: [], groups: [{ ref: "g|kg", quantity: 1 }] })).toBe(1);
  });
});

describe("currentListId", () => {
  const lists = [{ id: "a" }, { id: "b" }];
  it("keeps the stored pick while it is still one of the lists", () => {
    expect(currentListId("b", lists)).toBe("b");
  });
  it("falls back to the first list when the pick was left or removed, or nothing is stored", () => {
    expect(currentListId("gone", lists)).toBe("a");
    expect(currentListId(null, lists)).toBe("a");
    expect(currentListId("gone", [])).toBeNull();
  });
  it("trusts the stored pick until the lists load", () => {
    expect(currentListId("b", undefined)).toBe("b");
  });
});
