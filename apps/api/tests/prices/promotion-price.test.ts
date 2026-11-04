import { describe, expect, it } from "vitest";
import { promotionPrice, type RunningPromotion } from "#/prices/promotions.ts";

const rp = (o: Partial<RunningPromotion> & Pick<RunningPromotion, "kind" | "minQty" | "amount">): RunningPromotion => ({
  storeId: "s1", code: "A", id: "1", audience: "all", limitQty: null, weighted: 0, description: "", minPurchase: null, ...o,
});

describe("promotionPrice: what one unit costs on a Promotion, and the saving in whole percent", () => {
  it.each<[string, RunningPromotion, number, { price: number; saving: number }]>([
    ["a unit price", rp({ kind: "price", minQty: 1, amount: 4.9 }), 6.9, { price: 4.9, saving: 29 }],
    ["a unit price per kilo when weighed", rp({ kind: "price", minQty: 1, amount: 29.9, weighted: 1 }), 39.9, { price: 29.9, saving: 25 }],
    ["3 for ₪10, averaged over the set", rp({ kind: "bundle", minQty: 3, amount: 10 }), 4.5, { price: 3.33, saving: 26 }],
    ["20% off", rp({ kind: "percent", minQty: 1, amount: 20 }), 12.5, { price: 10, saving: 20 }],
    ["2+1: one of every 3 free", rp({ kind: "nth", minQty: 3, amount: 100 }), 9, { price: 6, saving: 33 }],
    ["the second at half price", rp({ kind: "nth", minQty: 2, amount: 50 }), 10, { price: 7.5, saving: 25 }],
    ["₪5 off 2", rp({ kind: "off", minQty: 2, amount: 5 }), 10, { price: 7.5, saving: 25 }],
  ])("%s", (_, p, shelf, expected) => {
    expect(promotionPrice(p, shelf)).toEqual(expected);
  });

  it("never reports a negative saving when the Promotion costs more than the shelf", () => {
    expect(promotionPrice(rp({ kind: "price", minQty: 1, amount: 7 }), 6.5)).toEqual({ price: 7, saving: 0 });
  });

  it("has no price for an info-only Promotion or a spend deal", () => {
    expect(promotionPrice(rp({ kind: "info", minQty: 0, amount: 0 }), 10)).toBeNull();
    expect(promotionPrice(rp({ kind: "off", minQty: 1, amount: 20, minPurchase: 100 }), 30)).toBeNull();
  });
});
