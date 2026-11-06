import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { chainLine, loadedCards, pageSubtitle, promoLines, promotionsQuery, type ChainPromo, type PromoCard } from "@/features/promotions/promo";
import { en, t, type StringKey } from "@/lib/strings";

const english = (k: StringKey) => en[k];
const card = (over: Partial<PromoCard> = {}): PromoCard => ({
  ref: "חלב|l", name: "חלב", measure: "l", soldBy: "unit", size: 1, code: "111", minPrice: 6.5, storeCount: 2, codes: ["111"],
  type: "dairy-eggs", promoPrice: 4.5, shelfPrice: 6.5, saving: 31, kind: "price", minQty: 1, amount: 4.5, audience: "all",
  text: "₪4.50 במקום ₪6.50", chainCount: 2, ...over,
});

describe("promoLines: what a Promotions card shows", () => {
  it("a sale price: the Promotion price per liter next to the struck Shelf price, and at how many Chains", () => {
    expect(promoLines(card(), t)).toEqual({ price: "₪4.50 לליטר", shelf: "₪6.50", shelfLabel: "במקום ₪6.50", deal: undefined, restricted: undefined, chains: "ב-2 רשתות" });
    expect(promoLines(card(), english)).toMatchObject({ price: "₪4.50 a liter", shelfLabel: "instead of ₪6.50", chains: "At 2 chains" });
  });

  it("prices a kilo group per kilo and a pack group per pack", () => {
    expect(promoLines(card({ measure: "kg", promoPrice: 29.9, shelfPrice: 39.9 }), t).price).toBe("₪29.90 לק״ג");
    expect(promoLines(card({ measure: "unit", size: 12, promoPrice: 10.9, shelfPrice: 12.9 }), t).price).toBe("₪10.90");
  });

  it("words a set Promotion's reward, since its price is averaged over the set", () => {
    const bundle = card({ measure: "kg", kind: "bundle", minQty: 3, amount: 9, promoPrice: 37.5, shelfPrice: 50, chainCount: 1 });
    expect(promoLines(bundle, t)).toMatchObject({ price: "₪37.50 לק״ג", deal: "3 ב-₪9.00", chains: "ברשת אחת" });
    expect(promoLines(bundle, english)).toMatchObject({ deal: "3 for ₪9.00", chains: "At 1 chain" });
    expect(promoLines(card({ kind: "nth", minQty: 2, amount: 100 }), t).deal).toBe("1+1");
  });

  it("shows the Chain's own description when no price can be worked out", () => {
    const info = card({ kind: "info", minQty: 0, amount: 0, promoPrice: null, shelfPrice: null, saving: null, text: "1+1 על קפה נמס" });
    expect(promoLines(info, t)).toMatchObject({ price: undefined, shelf: undefined, deal: "1+1 על קפה נמס" });
  });

  it.each([
    ["club", "במועדון", "Club price"],
    ["card", "בכרטיס", "With a card"],
    ["coupon", "עם קופון", "With a coupon"],
  ] as const)("labels a price Restricted to %s", (audience, hebrew, english_) => {
    expect(promoLines(card({ audience }), t).restricted).toBe(hebrew);
    expect(promoLines(card({ audience }), english).restricted).toBe(english_);
  });
});

describe("promotionsQuery", () => {
  it("asks for the rounded location and radius, plus the filters picked", () => {
    expect(promotionsQuery({ lat: 32.08531, lng: 34.78179 }, 10, null, null)).toBe("?lat=32.085&lng=34.782&radiusKm=10");
    expect(promotionsQuery({ lat: 32.08531, lng: 34.78179 }, 5, "snacks-sweets", "7290058140886")).toBe(
      "?lat=32.085&lng=34.782&radiusKm=5&type=snacks-sweets&chain=7290058140886",
    );
  });
});

describe("loadedCards", () => {
  it("lists the loaded pages' cards in order, a card that moved to a later page once", () => {
    const milk = card();
    const lone = card({ ref: null, code: "222" });
    const bamba = card({ ref: "במבה|kg" });
    expect(loadedCards([{ cards: [milk, lone], next: 2 }, { cards: [lone, bamba], next: null }])).toEqual([milk, lone, bamba]);
    expect(loadedCards()).toEqual([]);
  });
});

const chain = (over: Partial<ChainPromo> = {}): ChainPromo => ({
  chainId: "7290058140886", promoPrice: 4.5, shelfPrice: 6.5, saving: 31, kind: "price", minQty: 1, amount: 4.5, audience: "all",
  text: "₪4.50 במקום ₪6.50", ...over,
});

describe("chainLine: one Chain's Promotion under a Product on its product page", () => {
  it("a priced one: the Promotion price next to the Shelf price, read as 'instead of', and its reward in words", () => {
    expect(chainLine(chain(), "רמי לוי", "unit", t)).toEqual({
      price: "₪4.50", shelf: "₪6.50", text: "מחיר מבצע", restricted: undefined, info: false,
      label: "רמי לוי, ₪4.50, במקום ₪6.50, מחיר מבצע",
    });
    expect(chainLine(chain({ kind: "bundle", minQty: 3, amount: 9, promoPrice: 3, shelfPrice: 4 }), "Rami Levy", "unit", english)).toMatchObject({
      price: "₪3.00", shelf: "₪4.00", text: "3 for ₪9.00", label: "Rami Levy, ₪3.00, instead of ₪4.00, 3 for ₪9.00",
    });
  });

  it("prices a weighed Product per kilo", () => {
    expect(chainLine(chain({ promoPrice: 29.9, shelfPrice: 39.9, amount: 29.9 }), "רמי לוי", "weight", t)).toMatchObject({ price: "₪29.90 לק״ג", shelf: "₪39.90 לק״ג" });
  });

  it.each([
    ["club", "לחברי מועדון", "For club members"],
    ["card", "בכרטיס אשראי", "With a credit card"],
    ["coupon", "עם קופון", "With a coupon"],
  ] as const)("labels a Promotion Restricted to %s", (audience, hebrew, english_) => {
    expect(chainLine(chain({ audience }), "רמי לוי", "unit", t)).toMatchObject({ restricted: hebrew, label: `רמי לוי, ₪4.50, במקום ₪6.50, מחיר מבצע, ${hebrew}` });
    expect(chainLine(chain({ audience }), "Rami Levy", "unit", english).restricted).toBe(english_);
  });

  it("shows the Chain's own description when there is no price we can work out", () => {
    const info = chain({ kind: "info", minQty: 0, amount: 0, promoPrice: null, shelfPrice: null, saving: null, text: "1+1 על קפה נמס" });
    expect(chainLine(info, "ויקטורי", "unit", english)).toEqual({
      price: undefined, shelf: undefined, text: "1+1 על קפה נמס", restricted: undefined, info: true, label: "ויקטורי, 1+1 על קפה נמס",
    });
  });
});

describe("pageSubtitle", () => {
  it("says at how many Chains the group is on a Promotion and from what price", () => {
    expect(pageSubtitle(card({ chainCount: 4 }), t)).toBe("מבצעים ב-4 רשתות · מ-₪4.50 לליטר");
    expect(pageSubtitle(card({ chainCount: 1, measure: "unit", promoPrice: 10.9 }), english)).toBe("Promotions at 1 chain · from ₪10.90");
    expect(pageSubtitle(card({ promoPrice: null }), t)).toBe("מבצעים ב-2 רשתות");
  });
});
