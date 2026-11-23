import { describe, expect, it } from "vitest";
import type { Card, ProductStore } from "@/features/home/api";
import { openTarget } from "@/features/home/card";
import { storeRow } from "@/features/home/product-page";

const store: ProductStore = { chainName: "שופרסל", storeName: "דיזנגוף", distanceKm: 1.2, lat: 32.1, lng: 34.8, price: 6, promoPrice: null, promoText: null };

describe("openTarget (what a card opens)", () => {
  const card: Card = { ref: "חלב|l", name: "חלב", measure: "l", soldBy: "unit", size: 1, code: "111", minPrice: 5, storeCount: 2, codes: ["111", "222"] };

  it("opens the Group page for a card with a group ref, and the Product page for one without", () => {
    expect(openTarget(card, "dairy-eggs")).toEqual({ pathname: "/group/[ref]", params: { ref: "חלב|l", type: "dairy-eggs" } });
    expect(openTarget({ ...card, ref: null, code: "333" }, "other")).toEqual({ pathname: "/product/[code]", params: { code: "333", type: "other" } });
  });
});

describe("storeRow (a store on the Product page)", () => {
  it("shows distance and Waze for a store with a location, at its shelf price", () => {
    expect(storeRow(store)).toEqual({ price: 6, shelf: null, promoText: null, distanceKm: 1.2, waze: { lat: 32.1, lng: 34.8 } });
  });

  it("hides distance without a location", () => {
    expect(storeRow({ ...store, distanceKm: undefined }).distanceKm).toBeNull();
  });

  it("hides Waze for a store with no coordinates", () => {
    expect(storeRow({ ...store, lat: null, lng: null }).waze).toBeNull();
  });

  it("shows a Promotion price over the struck shelf price, with its text", () => {
    expect(storeRow({ ...store, promoPrice: 4.9, promoText: "₪4.90" })).toMatchObject({ price: 4.9, shelf: 6, promoText: "₪4.90" });
  });
});
