import { describe, expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

import { en, he, type StringKey } from "@/lib/strings";
import { formatQuantity, lineDetail, priceLabel, showPill } from "@/features/items/labels";

const tEn = (k: StringKey) => en[k];
const tHe = (k: StringKey) => he[k];

describe("formatQuantity", () => {
  it("shows units as ×N", () => {
    expect(formatQuantity(2, "unit", tEn)).toBe("×2");
    expect(formatQuantity(1, "unit", tHe)).toBe("×1");
  });

  it("shows weight in grams under a kilo and kilos from one, in both languages", () => {
    expect(formatQuantity(0.5, "weight", tEn)).toBe("500 g");
    expect(formatQuantity(1, "weight", tEn)).toBe("1 kg");
    expect(formatQuantity(1.5, "weight", tEn)).toBe("1.5 kg");
    expect(formatQuantity(0.5, "weight", tHe)).toBe("500 גרם");
    expect(formatQuantity(1, "weight", tHe)).toBe("1 ק״ג");
    expect(formatQuantity(1.5, "weight", tHe)).toBe("1.5 ק״ג");
  });
});

describe("showPill", () => {
  it("hides ×1 on the List but always shows weight", () => {
    expect(showPill(1, "unit", "list")).toBe(false);
    expect(showPill(2, "unit", "list")).toBe(true);
    expect(showPill(1, "weight", "list")).toBe(true);
    expect(showPill(0.5, "weight", "list")).toBe(true);
  });

  it("always shows on My items", () => {
    expect(showPill(1, "unit", "items")).toBe(true);
    expect(showPill(1, "weight", "items")).toBe(true);
  });
});

describe("priceLabel and lineDetail", () => {
  it("says per kilo for weight only", () => {
    expect(priceLabel(9.9, "weight", tEn)).toBe("₪9.90/kg");
    expect(priceLabel(9.9, "weight", tHe)).toBe("₪9.90 לק״ג");
    expect(priceLabel(6.9, "unit", tHe)).toBe("₪6.90");
  });

  it("shows amount × unit price", () => {
    expect(lineDetail(2, 6.9, "unit", tEn)).toBe("2 × ₪6.90");
    expect(lineDetail(1.5, 9.9, "weight", tHe)).toBe("1.5 ק״ג × ₪9.90 לק״ג");
    expect(lineDetail(0.5, 12.9, "weight", tHe)).toBe("500 גרם × ₪12.90 לק״ג");
  });
});
