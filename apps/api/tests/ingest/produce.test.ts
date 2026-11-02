import { describe, expect, it } from "vitest";
import { isGtin } from "#/ingest/parse.ts";
import { produceKey, produceName, soldBy } from "#/ingest/produce.ts";

const KG = "1 קילוגרם";
const key = (name: string, unitQty: string | null = KG, isWeighted = true, code = "123") => produceKey({ code, name, isWeighted, unitQty });
const gtin = (base: string) => {
  const sum = [...base].reverse().reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 1 : 3), 0);
  return base + ((10 - (sum % 10)) % 10);
};

describe("soldBy", () => {
  it("is weight only for weighted products measured in mass", () => {
    expect(soldBy(true, "1 קילוגרם")).toBe("weight");
    expect(soldBy(true, '1 ק"ג')).toBe("weight");
    expect(soldBy(true, "100 גרם")).toBe("weight");
    expect(soldBy(true, "1 יחידות")).toBe("unit");
    expect(soldBy(true, "1 ליטר")).toBe("unit");
    expect(soldBy(true, null)).toBe("unit");
    expect(soldBy(false, "1 קילוגרם")).toBe("unit");
  });
});

describe("produceName", () => {
  it("drops noise words but keeps packed", () => {
    expect(produceName("גזר תפזורת")).toBe("גזר");
    expect(produceName("בננות ישראל")).toBe("בננות");
    expect(produceName("גזר ארוז")).toBe("גזר ארוז");
    expect(produceName("תפו\"א לבן")).toBe("תפוח אדמה לבן");
  });

  it("falls back to the trimmed name when only noise is left", () => {
    expect(produceName(" תפזורת ")).toBe("תפזורת");
  });
});

describe("produceKey", () => {
  it("merges spelling, plural, origin and by-weight variants of banana", () => {
    const names = ["בננה", "בננות", "בננה מובחרת", "בננות ישראל", "בננה במשקל"];
    expect(new Set(names.map((n) => key(n)))).toEqual(new Set(["בננה|weight"]));
  });

  it("merges tomato forms but keeps organic and cherry apart", () => {
    const tomato = ["עגבניה", "עגבנייה", "עגבניות", "עגבנייה ישראל", "עגבניות ישראלי"].map((n) => key(n));
    expect(new Set(tomato).size).toBe(1);
    expect(key("עגבניה אורגנית")).not.toBe(tomato[0]);
    expect(key("עגבניות שרי")).not.toBe(tomato[0]);
  });

  it("merges loose carrots and keeps packed separate", () => {
    const loose = ["גזר", "גזר תפזורת", "גזר בתפזורת"].map((n) => key(n));
    expect(loose).toEqual(["גזר|weight", "גזר|weight", "גזר|weight"]);
    const packed = [key("גזר ארוז"), key("גזר טרי ארוז")];
    expect(packed[0]).toBe(packed[1]);
    expect(packed[0]).not.toBe(loose[0]);
  });

  it("merges the potato abbreviation with the full name", () => {
    const k = key('תפו"א לבן');
    expect(key("תפוח אדמה לבן תפזורת")).toBe(k);
    expect(key("תפוח אדמה לבן במשקל")).toBe(k);
  });

  it("keeps weight and unit apart", () => {
    expect(key("בננות", "1 יחידות")).toBe("בננה|unit");
    expect(key("בננות", "1 יחידות")).not.toBe(key("בננות"));
    expect(key("בננות", "1 ליטר")).toBe(key("בננות", "1 יחידות"));
  });

  it("is null for a barcoded product that is not weighted, grouped when weighted", () => {
    const code = gtin("729000006631");
    expect(isGtin(code)).toBe(true);
    expect(key("חלב תנובה 3%", "1 ליטר", false, code)).toBeNull();
    expect(key("בננה", KG, true, code)).toBe("בננה|weight");
  });

  it("groups a non-weighted product with a chain-local code", () => {
    expect(key("מלפפון", "1 יחידה", false, "55")).toBe("מלפפון|unit");
  });
});
