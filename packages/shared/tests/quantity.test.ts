import { describe, expect, it } from "vitest";
import { isValidQuantity, QUANTITY, stepQuantity } from "@grocer/shared/quantity";

describe("isValidQuantity", () => {
  it("units: whole numbers from 1 to 99", () => {
    for (const q of [1, 2, 99]) expect(isValidQuantity(q, "unit")).toBe(true);
    for (const q of [0, -1, 1.5, 0.5, 100, NaN, Infinity]) expect(isValidQuantity(q, "unit")).toBe(false);
  });

  it("weight: half kilos from 0.5 to 99", () => {
    for (const q of [0.5, 1, 1.5, 99]) expect(isValidQuantity(q, "weight")).toBe(true);
    for (const q of [0, -0.5, 0.25, 1.25, 99.5, NaN]) expect(isValidQuantity(q, "weight")).toBe(false);
  });
});

describe("stepQuantity", () => {
  it("steps by 1 for units and 0.5 for weight", () => {
    expect(stepQuantity(2, "unit", 1)).toBe(3);
    expect(stepQuantity(2, "unit", -1)).toBe(1);
    expect(stepQuantity(1, "weight", 1)).toBe(1.5);
    expect(stepQuantity(1, "weight", -1)).toBe(0.5);
  });

  it("clamps at the minimum and the maximum", () => {
    expect(stepQuantity(1, "unit", -1)).toBe(1);
    expect(stepQuantity(0.5, "weight", -1)).toBe(0.5);
    expect(stepQuantity(QUANTITY.max, "unit", 1)).toBe(QUANTITY.max);
    expect(stepQuantity(QUANTITY.max, "weight", 1)).toBe(QUANTITY.max);
  });

  it("starts at 1 for both", () => {
    expect(QUANTITY.start).toBe(1);
  });
});
