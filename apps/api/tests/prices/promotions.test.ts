import { describe, expect, it } from "vitest";
import { priceLines, type LineOption, type RunningPromotion } from "#/prices/promotions.ts";

const rp = (code: string, o: Partial<RunningPromotion> & Pick<RunningPromotion, "id" | "kind" | "minQty" | "amount">): RunningPromotion => ({
  storeId: "s1",
  code,
  audience: "all",
  limitQty: null,
  weighted: 0,
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
