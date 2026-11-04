import { describe, expect, it } from "vitest";
import { priceLines as priceList, type LineOption, type RunningPromotion } from "#/prices/promotions.ts";

const priceLines = (lines: LineOption[][]) => priceList(lines).lines;
const rp = (code: string, o: Partial<RunningPromotion> & Pick<RunningPromotion, "id" | "kind" | "minQty" | "amount">): RunningPromotion => ({
  storeId: "s1",
  code,
  audience: "all",
  limitQty: null,
  weighted: 0,
  description: "",
  minPurchase: null,
  ...o,
});
/** One List line: its no-Promotion option, then one option per Promotion row. */
const line = (code: string, price: number, quantity: number, ...promos: RunningPromotion[]): LineOption[] => [
  { code, price, quantity },
  ...promos.map((promo) => ({ code, price, quantity, promo })),
];
const cents = (n: number) => Math.round(n * 100);

describe("priceLines: off", () => {
  it("takes the amount off each unit when minQty is 1", () => {
    const [r] = priceLines([line("A", 10, 3, rp("A", { id: "1", kind: "off", minQty: 1, amount: 2 }))]);
    expect(r!.option.promo?.id).toBe("1");
    expect(r!.lineTotal).toBeCloseTo(24, 2); // 3 * (10 - 2)
    expect(r!.promotion).toEqual({ id: "1", kind: "off", minQty: 1, amount: 2, audience: "all", text: "₪2 הנחה" });
  });

  it("takes the amount off each full set of minQty units", () => {
    const [r] = priceLines([line("A", 10, 5, rp("A", { id: "2", kind: "off", minQty: 2, amount: 5 }))]);
    expect(r!.lineTotal).toBeCloseTo(40, 2); // 2 full sets: 50 - 2 * 5; the fifth unit is beyond them
    expect(r!.promotion?.text).toBe("₪5 הנחה בקניית 2");
  });

  it("does not reach a set: Shelf total", () => {
    const [r] = priceLines([line("A", 10, 1, rp("A", { id: "2", kind: "off", minQty: 2, amount: 5 }))]);
    expect(r!.lineTotal).toBeCloseTo(10, 2);
    expect(r!.option.promo).toBeUndefined();
    expect(r!).not.toHaveProperty("promotion");
  });

  it("never takes a unit below 0", () => {
    const [r] = priceLines([line("A", 3, 1, rp("A", { id: "3", kind: "off", minQty: 1, amount: 5 }))]);
    expect(r!.lineTotal).toBeCloseTo(0, 2);
  });

  it("writes agorot in the text only when there are some", () => {
    const [r] = priceLines([line("A", 20, 1, rp("A", { id: "4", kind: "off", minQty: 1, amount: 12.9 }))]);
    expect(r!.promotion?.text).toBe("₪12.90 הנחה");
  });
});

describe("priceLines: sharing a Promotion", () => {
  it("rounds each line's share to agorot and puts the remainder on one line, so the lines add up exactly", () => {
    const bundle = (code: string) => rp(code, { id: "5", kind: "bundle", minQty: 3, amount: 10 });
    const rs = priceLines([line("A", 4, 1, bundle("A")), line("B", 4, 1, bundle("B")), line("C", 4, 1, bundle("C"))]);
    // 10 * 4 / 12 = 3.3333 each -> 3.33 three times is 9.99; one line takes the missing 0.01
    for (const r of rs) expect([333, 334]).toContain(cents(r.lineTotal));
    expect(rs.reduce((sum, r) => sum + cents(r.lineTotal), 0)).toBe(1000);
    for (const r of rs) expect(r.promotion?.id).toBe("5");
  });
});

describe("priceLines: hints", () => {
  it("lists a running Promotion the Quantity does not reach", () => {
    const [r] = priceLines([line("A", 4, 2, rp("A", { id: "6", kind: "bundle", minQty: 3, amount: 10 }))]);
    expect(r!.option.promo).toBeUndefined();
    expect(r!.lineTotal).toBeCloseTo(8, 2);
    expect(r!).not.toHaveProperty("promotion");
    expect(r!.hints).toEqual([{ id: "6", kind: "bundle", minQty: 3, amount: 10, audience: "all", text: "3 ב-₪10" }]);
  });

  it("has no hints property when there is nothing to hint", () => {
    const [r] = priceLines([line("A", 4, 3, rp("A", { id: "6", kind: "bundle", minQty: 3, amount: 10 }))]);
    expect(r!.promotion?.id).toBe("6");
    expect(r!).not.toHaveProperty("hints");
    const [none] = priceLines([line("B", 4, 1)]);
    expect(none!).not.toHaveProperty("hints");
  });
});

describe("priceLines: info-only Promotions", () => {
  it("lists them in info, never in the search, a total or the hints", () => {
    const info = (code: string) => rp(code, { id: "7", kind: "info", minQty: 0, amount: 0, description: "מתנה" });
    const nth = (code: string) => rp(code, { id: "8", kind: "nth", minQty: 2, amount: 100 });
    const rs = priceLines([line("A", 5, 2, info("A"), nth("A")), line("B", 3, 1, info("B"))]);
    expect(rs[0]).toMatchObject({ lineTotal: 5, promotion: { id: "8", text: "1+1" }, info: [{ id: "7", description: "מתנה" }] });
    expect(rs[1]).toMatchObject({ lineTotal: 3, info: [{ id: "7", description: "מתנה" }] });
    expect(rs[1]!.option.promo).toBeUndefined();
    for (const r of rs) expect(r).not.toHaveProperty("hints");
  });
});

describe("priceLines: many linked lines (local search past 4096 combinations)", () => {
  // 7 lines of one product at ₪10, each with 4 options (none, P1, P2, P3) = 4^7 = 16384 combinations, all linked by shared ids,
  // so the exhaustive search (limit 4096) is skipped. P1 is ₪9 and P2 ₪8 per unit; P3 is 7 for a bundle price shared by every line.
  const lines = (bundle: number) =>
    [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const c = `L${i}`;
      return line(
        c,
        10,
        1,
        rp(c, { id: "P1", kind: "price", minQty: 1, amount: 9 }),
        rp(c, { id: "P2", kind: "price", minQty: 1, amount: 8 }),
        rp(c, { id: "P3", kind: "bundle", minQty: 7, amount: bundle }),
      );
    });

  it("finds the bundle all lines must join, which no single-line change reaches from Shelf", () => {
    // Optimum: all 7 on P3 = 35. Changing one line at a time stops at P2 (7 * 8 = 56): one line alone on P3 is a set of 1.
    const input = lines(35);
    const rs = priceLines(input);
    expect(rs.reduce((a, r) => a + cents(r.lineTotal), 0)).toBe(3500);
    rs.forEach((r, i) => {
      expect(input[i]).toContain(r.option);
      expect(r.promotion?.id).toBe("P3");
      expect(cents(r.lineTotal)).toBe(500);
    });
  });

  it("never beats Shelf and the lines on the shared bundle add up to its rounded total", () => {
    // 7 for 34.99: 4.9986 per line rounds to 5.00 each (35.00), one line takes the missing 0.01
    const input = lines(34.99);
    const rs = priceLines(input);
    const total = rs.reduce((a, r) => a + cents(r.lineTotal), 0);
    expect(total).toBe(3499);
    expect(total).toBeLessThanOrEqual(7000);
    rs.forEach((r, i) => {
      expect(input[i]).toContain(r.option);
      expect(r.promotion?.id).toBe("P3");
    });
  });
});

describe("priceLines: two spend deals", () => {
  const deal = (code: string, id: string, amount: number) => rp(code, { id, kind: "price", minQty: 1, amount, minPurchase: 20 });
  const world = (c: number) => priceList([line("A", 10, 1, deal("A", "D1", 5)), line("B", 10, 1, deal("B", "D2", 4)), line("C", c, 1)]);

  it("both apply when each minimum holds with the other applied", () => {
    // C 30: D1's rest = B 4 + C 30 = 34 >= 20; D2's rest = A 5 + 30 = 35 >= 20. Savings 5 + 6 = 11, total 39
    const { basket } = world(30);
    expect(basket.map((b) => b.id).sort()).toEqual(["D1", "D2"]);
    expect(basket.reduce((a, b) => a + b.saving, 0)).toBe(11);
  });

  it("keeps only the bigger saving when together they break each other's minimum", () => {
    // C 12: both -> D1's rest = 4 + 12 = 16 < 20. D1 alone: 5 + 10 + 12 = 27. D2 alone: 10 + 4 + 12 = 26 -> D2 only
    const { basket } = world(12);
    expect(basket.map((b) => b.id)).toEqual(["D2"]);
    expect(basket[0]!.saving).toBe(6);
  });
});
