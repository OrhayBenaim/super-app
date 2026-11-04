import { describe, expect, it } from "vitest";

import { en, type StringKey } from "@/lib/strings";
import { groupFacts, groupTitle, productDetail, sizeLabel } from "@/features/items/labels";
import type { Product, ProductGroup } from "@/features/items/products";

const t = (k: StringKey) => en[k];

const group = (over: Partial<ProductGroup> = {}): ProductGroup => ({
  kind: "group", ref: "בורגול|kg", name: "בורגול", measure: "kg", size: 0.5, soldBy: "unit", productCount: 63, storeCount: 120, minPrice: 6.8, refinements: [], ...over,
});
const product = (over: Partial<Product> = {}): Product => ({
  kind: "product", code: "1", name: "x", manufacturer: "סוגת", unitQty: null, measure: "kg", size: 0.5, soldBy: "unit", storeCount: 4, minPrice: 3.7, ...over,
});

describe("sizeLabel", () => {
  it("shows grams under a kilo and kilos from one", () => {
    expect(sizeLabel("kg", 0.5, t)).toBe("500 g");
    expect(sizeLabel("kg", 0.25, t)).toBe("250 g");
    expect(sizeLabel("kg", 1, t)).toBe("1 kg");
    expect(sizeLabel("kg", 1.5, t)).toBe("1.5 kg");
  });

  it("shows milliliters under a liter and liters from one", () => {
    expect(sizeLabel("l", 0.33, t)).toBe("330 ml");
    expect(sizeLabel("l", 1, t)).toBe("1 L");
    expect(sizeLabel("l", 1.5, t)).toBe("1.5 L");
  });

  it("shows a pack count for units", () => {
    expect(sizeLabel("unit", 12, t)).toBe("12 units");
  });
});

describe("groupTitle", () => {
  it("is the name, with the pack count only for a unit group", () => {
    expect(groupTitle(group(), t)).toBe("בורגול");
    expect(groupTitle(group({ name: "ביצים", measure: "unit", size: 12 }), t)).toBe("ביצים · 12 units");
  });
});

describe("groupFacts", () => {
  it("lists product count, lowest price per kilo and branches", () => {
    expect(groupFacts(group(), t)).toEqual(["63 products", "from ₪6.80 a kilo", "in 120 branches"]);
  });

  it("marks a group sold by weight, so picking it is known to switch the item to kilos", () => {
    expect(groupFacts(group({ soldBy: "weight", size: 1 }), t)).toEqual(["by weight", "63 products", "from ₪6.80 a kilo", "in 120 branches"]);
  });

  it("says per liter for liquids and the pack price for a unit group", () => {
    expect(groupFacts(group({ measure: "l" }), t)[1]).toBe("from ₪6.80 a liter");
    expect(groupFacts(group({ measure: "unit", size: 12, minPrice: 13 }), t)[1]).toBe("from ₪13.00");
  });

  it("at one store, gives only that store's price, with no product or branch count", () => {
    expect(groupFacts(group(), t, true)).toEqual(["₪6.80 a kilo"]);
    expect(groupFacts(group({ soldBy: "weight", size: 1 }), t, true)).toEqual(["by weight", "₪6.80 a kilo"]);
    expect(groupFacts(group({ measure: "l" }), t, true)).toEqual(["₪6.80 a liter"]);
    expect(groupFacts(group({ measure: "unit", size: 12, minPrice: 13 }), t, true)).toEqual(["₪13.00"]);
  });
});

describe("productDetail", () => {
  it("joins size, lowest price and branches", () => {
    expect(productDetail(product(), t)).toBe("500 g · from ₪3.70 · in 4 branches");
  });

  it("adds the manufacturer only when asked and when there is one", () => {
    expect(productDetail(product(), t, { manufacturer: true })).toBe("500 g · סוגת · from ₪3.70 · in 4 branches");
    expect(productDetail(product({ manufacturer: null }), t, { manufacturer: true })).toBe("500 g · from ₪3.70 · in 4 branches");
  });

  it("marks a product sold by weight and gives its price per kilo, in place of its size", () => {
    expect(productDetail(product({ soldBy: "weight", size: 1, minPrice: 8.9 }), t)).toBe("by weight · from ₪8.90/kg · in 4 branches");
  });

  it("leaves the size out when it cannot be read", () => {
    expect(productDetail(product({ measure: null, size: null }), t)).toBe("from ₪3.70 · in 4 branches");
  });

  it("at one store, gives only that store's price, with no branch count", () => {
    expect(productDetail(product(), t, { manufacturer: true, atStore: true })).toBe("500 g · סוגת · ₪3.70");
    expect(productDetail(product({ soldBy: "weight", size: 1, minPrice: 8.9 }), t, { atStore: true })).toBe("by weight · ₪8.90/kg");
  });
});
