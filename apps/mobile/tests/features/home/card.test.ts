import { describe, expect, it } from "vitest";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { stepQuantity } from "@grocer/shared/quantity";
import { cardSend, cardView, productView, typeNameKey, type CardTarget } from "@/features/home/card";
import type { Item } from "@/features/lists/api";
import { en, he } from "@/lib/strings";

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, listId: "l", name: id, category: "c", productCode: null, groupRef: null, missing: true, quantity: 1, soldBy: "unit", createdAt: "", updatedAt: "", ...over,
});
const milk: CardTarget = { name: "חלב", category: "מוצרי חלב וביצים", soldBy: "unit", groupRef: "חלב|l", codes: ["111", "222"] };
const tomato: CardTarget = { name: "עגבניה", category: "פירות וירקות", soldBy: "weight", groupRef: "עגבנ|kg", codes: ["333"] };

describe("cardView", () => {
  it("offers Add at 1 when the List has nothing for the group", () => {
    const view = cardView([item("bread", { groupRef: "לחם|unit|1", quantity: 2 })], milk, null);
    expect(view).toMatchObject({ action: "add", quantity: 1, soldBy: "unit", canLess: false, canMore: true });
    expect(view.item).toBeUndefined();
  });

  it("steps by 0.5 kg for a group sold by weight, starting at 1 kg, with 500 g the floor", () => {
    expect(cardView([], tomato, null)).toMatchObject({ quantity: 1, soldBy: "weight", canLess: true });
    const down = stepQuantity(1, "weight", -1);
    expect(down).toBe(0.5);
    expect(cardView([], tomato, down)).toMatchObject({ quantity: 0.5, canLess: false });
    expect(stepQuantity(1, "weight", 1)).toBe(1.5);
  });

  it("shows the group as on the List at the Item's Quantity, matched to the group or to one of its Products", () => {
    const byGroup = item("milk", { groupRef: "חלב|l", quantity: 2 });
    expect(cardView([byGroup], milk, null)).toMatchObject({ action: "onList", quantity: 2, item: byGroup });
    const byProduct = item("tnuva", { productCode: "222", quantity: 3 });
    expect(cardView([byProduct], milk, null)).toMatchObject({ action: "onList", quantity: 3, item: byProduct });
  });

  it("turns into Update only once the stepper differs from the Item's Quantity", () => {
    const onList = [item("milk", { groupRef: "חלב|l", quantity: 2 })];
    expect(cardView(onList, milk, 3).action).toBe("update");
    expect(cardView(onList, milk, 2).action).toBe("onList");
  });

  it("counts the matched Item's Sold by, not the card's", () => {
    const byKilo = item("milk", { productCode: "111", quantity: 1.5, soldBy: "weight" });
    expect(cardView([byKilo], milk, null)).toMatchObject({ soldBy: "weight", quantity: 1.5 });
  });

  it("offers Add again, from 1, for an Item that is matched but off the List", () => {
    const bought = item("milk", { groupRef: "חלב|l", missing: false, quantity: 4 });
    expect(cardView([bought], milk, null)).toMatchObject({ action: "add", quantity: 1, item: bought });
  });

  it("prefers the Item on the List when one on and one off it match", () => {
    const off = item("old", { groupRef: "חלב|l", missing: false });
    const on = item("new", { productCode: "111", quantity: 2 });
    expect(cardView([off, on], milk, null).item).toBe(on);
  });
});

describe("cardSend", () => {
  it("Add creates an Item on the List, named after the group, matched to it, with the Quantity and the Product type's category", () => {
    expect(cardSend(cardView([], milk, 3), milk)).toEqual({
      kind: "add",
      body: { name: "חלב", category: "מוצרי חלב וביצים", groupRef: "חלב|l", quantity: 3, missing: true },
    });
  });

  it("Add on a specific Product matches that Product", () => {
    const product: CardTarget = { name: "חלב תנובה 3%", category: "x", soldBy: "unit", productCode: "111" };
    expect(cardSend(cardView([], product, null), product)).toMatchObject({ kind: "add", body: { productCode: "111", quantity: 1 } });
  });

  it("Update changes only the Quantity", () => {
    const onList = [item("milk", { groupRef: "חלב|l", quantity: 2 })];
    expect(cardSend(cardView(onList, milk, 3), milk)).toEqual({ kind: "update", id: "milk", patch: { quantity: 3 } });
  });

  it("Add on an Item off the List puts that Item back at the Quantity instead of adding a second one", () => {
    const bought = [item("milk", { groupRef: "חלב|l", missing: false, quantity: 4 })];
    expect(cardSend(cardView(bought, milk, 2), milk)).toEqual({ kind: "update", id: "milk", patch: { missing: true, quantity: 2 } });
  });

  it("sends nothing while the card shows on the List", () => {
    const onList = [item("milk", { groupRef: "חלב|l", quantity: 2 })];
    expect(cardSend(cardView(onList, milk, null), milk)).toBeNull();
  });
});

describe("Product type names", () => {
  it("has a Hebrew and an English name for every Product type, Other being the existing Other category", () => {
    for (const type of PRODUCT_TYPES) {
      expect(en[typeNameKey(type)], type).toMatch(/\S/);
      expect(he[typeNameKey(type)], type).toMatch(/\S/);
    }
    expect(typeNameKey("other")).toBe("items.category.other");
    expect(new Set(PRODUCT_TYPES.map((t) => he[typeNameKey(t)])).size).toBe(PRODUCT_TYPES.length);
    expect([en[typeNameKey("dairy-eggs")], he[typeNameKey("dairy-eggs")]]).toEqual(["Dairy & eggs", "מוצרי חלב וביצים"]);
  });
});

describe("productView (a Product row on a product page)", () => {
  const tnuva: CardTarget = { name: "חלב תנובה 3%", category: "מוצרי חלב וביצים", soldBy: "unit", productCode: "111" };
  const tara: CardTarget = { name: "חלב טרה 1%", category: "מוצרי חלב וביצים", soldBy: "unit", productCode: "222" };
  const loose: CardTarget = { name: "חלב בתפזורת", category: "מוצרי חלב וביצים", soldBy: "weight", productCode: "333" };

  it("offers Add from 1 on every Product while the List has nothing for the group, matching that exact Product", () => {
    const view = productView([], milk, tara, null);
    expect(view).toMatchObject({ action: "add", quantity: 1, soldBy: "unit" });
    expect(cardSend(view, tara)).toEqual({ kind: "add", body: { name: "חלב טרה 1%", category: "מוצרי חלב וביצים", productCode: "222", quantity: 1, missing: true } });
  });

  it("offers Add, not switch, when the group's Item is off the List", () => {
    const bought = [item("milk", { groupRef: "חלב|l", missing: false, quantity: 4 })];
    expect(productView(bought, milk, tara, null)).toMatchObject({ action: "add", quantity: 1 });
  });

  it("offers switch to this on every Product while the group itself is on the List, at the Item's Quantity", () => {
    const onList = [item("milk", { groupRef: "חלב|l", quantity: 2 })];
    const view = productView(onList, milk, tara, null);
    expect(view).toMatchObject({ action: "switch", quantity: 2, soldBy: "unit", item: onList[0] });
    expect(cardSend(view, tara)).toEqual({ kind: "update", id: "milk", patch: { productCode: "222", quantity: 2 } });
    expect(cardSend(productView(onList, milk, tara, 3), tara)).toEqual({ kind: "update", id: "milk", patch: { productCode: "222", quantity: 3 } });
  });

  it("shows the matched Product as on the List, then Update once its stepper differs; every other Product offers switch", () => {
    const onList = [item("milk", { productCode: "111", quantity: 2 })];
    expect(productView(onList, milk, tnuva, null)).toMatchObject({ action: "onList", quantity: 2 });
    expect(cardSend(productView(onList, milk, tnuva, null), tnuva)).toBeNull();
    expect(cardSend(productView(onList, milk, tnuva, 3), tnuva)).toEqual({ kind: "update", id: "milk", patch: { quantity: 3 } });
    expect(productView(onList, milk, tara, null)).toMatchObject({ action: "switch", quantity: 2 });
  });

  it("starts a Product Sold by the other way over at 1 (1 kg), stepping its own way", () => {
    const onList = [item("milk", { productCode: "111", quantity: 3 })];
    const view = productView(onList, milk, loose, null);
    expect(view).toMatchObject({ action: "switch", quantity: 1, soldBy: "weight", canLess: true });
    expect(cardSend(view, loose)).toEqual({ kind: "update", id: "milk", patch: { productCode: "333", quantity: 1 } });
    expect(productView(onList, milk, loose, 0.5)).toMatchObject({ quantity: 0.5, canLess: false });
  });
});
