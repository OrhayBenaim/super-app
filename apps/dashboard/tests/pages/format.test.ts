import { describe, expect, it } from "vitest";
import { size } from "#/pages/format.ts";

describe("size", () => {
  it("writes grams and milliliters under a kilo or liter, without float noise, and packs as pieces", () => {
    expect(size({ measure: "kg", size: 0.17300000000000001 })).toBe("173 g");
    expect(size({ measure: "kg", size: 0.85 })).toBe("850 g");
    expect(size({ measure: "l", size: 0.33 })).toBe("330 ml");
    expect(size({ measure: "l", size: 1.5 })).toBe("1.5 l");
    expect(size({ measure: "kg", size: 1 })).toBe("1 kg");
    expect(size({ measure: "unit", size: 12 })).toBe("12 pcs");
    expect(size({ measure: null, size: null })).toBe("—");
  });
});
