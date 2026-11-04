import { describe, expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

import { promotionText } from "@/features/compare/promotion";
import { shekels } from "@/features/compare/format";
import { en, he, type StringKey } from "@/lib/strings";
import type { Promotion } from "@/features/compare/sort";

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
});
