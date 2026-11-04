import { describe, expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

import { basketText, promotionRows, promotionText } from "@/features/compare/promotion";
import { shekels } from "@/features/compare/format";
import { en, he, type StringKey } from "@/lib/strings";
import type { BasketDeal, Promotion } from "@/features/compare/sort";

const tEn = (k: StringKey) => en[k];
const tHe = (k: StringKey) => he[k];
const promo = (over: Partial<Promotion>): Promotion => ({ id: "p", kind: "price", minQty: 1, amount: 10, audience: "all", text: "SERVER TEXT", ...over });

describe("promotionText", () => {
  it("bundle: '{qty} for {price}' from minQty and amount", () => {
    expect(promotionText(promo({ kind: "bundle", minQty: 3, amount: 10 }), "unit", tEn)).toBe(`3 for ${shekels(10)}`);
  });
  it("bundle in Hebrew", () => {
    expect(promotionText(promo({ kind: "bundle", minQty: 3, amount: 10 }), "unit", tHe)).toBe(`3 ב-${shekels(10)}`);
  });
  it("percent: '{n}% off'", () => {
    expect(promotionText(promo({ kind: "percent", amount: 20 }), "unit", tEn)).toBe("20% off");
    expect(promotionText(promo({ kind: "percent", amount: 20 }), "unit", tHe)).toBe("20% הנחה");
  });
  it("price sold by unit: 'Sale price'", () => {
    expect(promotionText(promo({ kind: "price" }), "unit", tEn)).toBe("Sale price");
    expect(promotionText(promo({ kind: "price" }), "unit", tHe)).toBe("מחיר מבצע");
  });
  it("price sold by weight: per-kilo price", () => {
    expect(promotionText(promo({ kind: "price", amount: 7.9 }), "weight", tEn)).toBe(`${shekels(7.9)}/kg`);
  });
  it("never uses the server's text", () => {
    expect(promotionText(promo({ kind: "percent", amount: 5 }), "unit", tEn)).not.toContain("SERVER");
  });
  it("nth at 100%: '{n}+{m}'", () => {
    for (const t of [tEn, tHe]) {
      expect(promotionText(promo({ kind: "nth", minQty: 3, amount: 100 }), "unit", t)).toBe("2+1");
      expect(promotionText(promo({ kind: "nth", minQty: 2, amount: 100 }), "unit", t)).toBe("1+1");
    }
  });
  it("nth at another percent", () => {
    expect(promotionText(promo({ kind: "nth", minQty: 2, amount: 50 }), "unit", tEn)).toBe("Buy 2, one at 50% off");
    expect(promotionText(promo({ kind: "nth", minQty: 2, amount: 50 }), "unit", tHe)).toBe("בקניית 2, אחד ב-50% הנחה");
  });
  it("off with minQty 1", () => {
    expect(promotionText(promo({ kind: "off", minQty: 1, amount: 5 }), "unit", tEn)).toBe(`${shekels(5)} off`);
    expect(promotionText(promo({ kind: "off", minQty: 1, amount: 5 }), "unit", tHe)).toBe(`${shekels(5)} הנחה`);
  });
  it("off with minQty above 1", () => {
    expect(promotionText(promo({ kind: "off", minQty: 2, amount: 5 }), "unit", tEn)).toBe(`${shekels(5)} off when you buy 2`);
    expect(promotionText(promo({ kind: "off", minQty: 2, amount: 5 }), "unit", tHe)).toBe(`${shekels(5)} הנחה בקניית 2`);
  });
});

describe("basketText", () => {
  const deal = (over: Partial<BasketDeal>): BasketDeal => ({ ...promo({}), minPurchase: 75, saving: 8, codes: ["a"], ...over });
  it("price sold by unit: the price itself and the minimum, not 'Sale price'", () => {
    expect(basketText(deal({ kind: "price", amount: 8.9 }), "unit", tEn)).toBe("₪8.90 when you spend ₪75.00");
    expect(basketText(deal({ kind: "price", amount: 8.9 }), "unit", tHe)).toBe("₪8.90 בקנייה מעל ₪75.00");
  });
  it("other kinds use promotionText", () => {
    expect(basketText(deal({ kind: "bundle", minQty: 2, amount: 110, minPurchase: 100 }), "unit", tHe)).toBe("2 ב-₪110.00 בקנייה מעל ₪100.00");
    expect(basketText(deal({ kind: "percent", amount: 20 }), "unit", tEn)).toBe("20% off when you spend ₪75.00");
  });
  it("never uses the server's text", () => {
    expect(basketText(deal({ kind: "percent", amount: 5 }), "unit", tEn)).not.toContain("SERVER");
  });
});

describe("promotionRows", () => {
  const club = promo({ kind: "percent", amount: 20, audience: "club" });
  it("is empty without a promotion, hints or info", () => {
    expect(promotionRows({}, "unit", tEn)).toEqual([]);
  });
  it("applied row: text and the audience label", () => {
    expect(promotionRows({ promotion: club }, "unit", tEn)).toEqual([{ kind: "applied", text: "20% off", label: "For club members" }]);
    expect(promotionRows({ promotion: club }, "unit", tHe)[0].label).toBe("לחברי מועדון");
  });
  it("applied row: no label for audience all and no partners", () => {
    const [r] = promotionRows({ promotion: promo({ kind: "percent", amount: 20 }) }, "unit", tEn);
    expect(r.label).toBeUndefined();
  });
  it("audience labels for card and coupon", () => {
    const label = (audience: Promotion["audience"], t: typeof tEn) => promotionRows({ promotion: promo({ audience }) }, "unit", t)[0].label;
    expect(label("card", tEn)).toBe("With a credit card");
    expect(label("card", tHe)).toBe("בכרטיס אשראי");
    expect(label("coupon", tEn)).toBe("With a coupon");
    expect(label("coupon", tHe)).toBe("עם קופון");
  });
  it("applied row: partners alone, and joined with the audience", () => {
    const all = promo({ kind: "bundle", minQty: 2, amount: 8 });
    expect(promotionRows({ promotion: all, partners: ["Milk", "Eggs"] }, "unit", tEn)[0].label).toBe("With Milk, Eggs");
    expect(promotionRows({ promotion: all, partners: ["חלב"] }, "unit", tHe)[0].label).toBe("יחד עם חלב");
    expect(promotionRows({ promotion: club, partners: ["Milk"] }, "unit", tEn)[0].label).toBe("For club members · With Milk");
  });
  it("hint rows: 'Promotion available' with the hint's audience label", () => {
    const hint = promo({ id: "h", kind: "bundle", minQty: 3, amount: 10, audience: "card" });
    expect(promotionRows({ hints: [hint] }, "unit", tEn)).toEqual([
      { kind: "hint", text: `Promotion available: 3 for ${shekels(10)}`, label: "With a credit card" },
    ]);
    const [h] = promotionRows({ hints: [promo({ kind: "percent", amount: 20 })] }, "unit", tHe);
    expect(h.text).toBe("יש מבצע: 20% הנחה");
    expect(h.label).toBeUndefined();
  });
  it("info rows carry the Chain's description as sent, no label", () => {
    expect(promotionRows({ info: [{ id: "i", description: "מבצע מיוחד" }] }, "unit", tEn)).toEqual([{ kind: "info", text: "מבצע מיוחד" }]);
  });
  it("orders applied, then hints, then info", () => {
    const rows = promotionRows({
      promotion: club, hints: [promo({ id: "h1" }), promo({ id: "h2" })], info: [{ id: "i1", description: "a" }, { id: "i2", description: "b" }],
    }, "unit", tEn);
    expect(rows.map((r) => r.kind)).toEqual(["applied", "hint", "hint", "info", "info"]);
  });
});

describe("compare.breakdown.infoFooter", () => {
  it("exists in en and he", () => {
    const key = "compare.breakdown.infoFooter" as StringKey;
    expect(en[key]).toBe("Promotions we can't price are shown for information only and left out of the total.");
    expect(typeof he[key]).toBe("string");
    expect(he[key].length).toBeGreaterThan(0);
  });
});
