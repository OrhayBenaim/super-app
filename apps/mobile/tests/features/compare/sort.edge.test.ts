import { describe, expect, it } from "vitest";
import { fmt, shekels } from "@/features/compare/format";
import { sortStores, type Sort, type StoreResult } from "@/features/compare/sort";

type Opts = { total?: number; distanceKm?: number; missing?: number; matched?: number };
const store = (storeId: string, o: Opts = {}): StoreResult => {
  const missing = o.missing ?? 0;
  return {
    storeId, chainId: "c", chainName: "C", storeName: storeId, address: "", city: "", lat: 0, lng: 0,
    distanceKm: o.distanceKm ?? 1, total: o.total ?? 10, matched: o.matched ?? 5 - missing,
    missingCodes: Array.from({ length: missing }, (_, i) => `m${i}`), items: [], orderUrl: null,
  };
};
const ids = (s: StoreResult[]) => s.map((x) => x.storeId);

describe("sortStores", () => {
  it("empty and single-element arrays, for every sort", () => {
    for (const s of ["price", "distance", "coverage"] as Sort[]) {
      expect(sortStores([], s)).toEqual([]);
      const one = [store("a")];
      expect(sortStores(one, s)).toEqual(one);
      expect(sortStores(one, s)).not.toBe(one);
    }
  });

  describe("price: missing -> total -> distance", () => {
    it("fewer missing beats a lower total", () => {
      expect(ids(sortStores([store("cheapButMissing", { missing: 1, total: 1 }), store("full", { total: 99 })], "price"))).toEqual(["full", "cheapButMissing"]);
    });
    it("equal missing: lower total first", () => {
      expect(ids(sortStores([store("b", { total: 20 }), store("a", { total: 10 })], "price"))).toEqual(["a", "b"]);
    });
    it("equal missing and total: nearest first", () => {
      expect(ids(sortStores([store("far", { distanceKm: 9 }), store("near", { distanceKm: 1 })], "price"))).toEqual(["near", "far"]);
    });
    it("uses missingCodes.length, not matched, for the missing count", () => {
      const a = { ...store("a", { total: 5 }), matched: 0 }; // inconsistent matched on purpose
      const b = store("b", { total: 50 });
      expect(ids(sortStores([b, a], "price"))).toEqual(["a", "b"]);
    });
  });

  describe("coverage: matched -> total -> distance", () => {
    it("most matched first even when pricier", () => {
      expect(ids(sortStores([store("few", { matched: 2, total: 1 }), store("many", { matched: 4, total: 100 })], "coverage"))).toEqual(["many", "few"]);
    });
    it("equal matched: lower total", () => {
      expect(ids(sortStores([store("b", { matched: 3, total: 9 }), store("a", { matched: 3, total: 8 })], "coverage"))).toEqual(["a", "b"]);
    });
    it("equal matched and total: nearest", () => {
      expect(ids(sortStores([store("far", { matched: 3, distanceKm: 5 }), store("near", { matched: 3, distanceKm: 0.2 })], "coverage"))).toEqual(["near", "far"]);
    });
    it("ignores missingCodes (uses matched only)", () => {
      const a = { ...store("a", { matched: 5 }), missingCodes: ["x", "y", "z"] };
      const b = store("b", { matched: 4 });
      expect(ids(sortStores([b, a], "coverage"))).toEqual(["a", "b"]);
    });
  });

  describe("distance", () => {
    it("nearest first, ignoring price/coverage; distance 0 sorts first", () => {
      const s = [store("b", { distanceKm: 2, total: 1 }), store("a", { distanceKm: 0 }), store("c", { distanceKm: 0.5, matched: 99 })];
      expect(ids(sortStores(s, "distance"))).toEqual(["a", "c", "b"]);
    });
    it("handles fractional distances precisely", () => {
      expect(ids(sortStores([store("b", { distanceKm: 0.1 + 0.2 }), store("a", { distanceKm: 0.3 })], "distance"))).toEqual(["a", "b"]);
    });
  });

  it("is stable: fully equal entries keep input order for every sort", () => {
    const same = ["a", "b", "c", "d"].map((id) => store(id));
    for (const s of ["price", "distance", "coverage"] as Sort[]) expect(ids(sortStores(same, s))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortStores([...same].reverse(), "price"))).toEqual(["d", "c", "b", "a"]);
  });

  it("is deterministic regardless of input permutation when keys are distinct", () => {
    const s = [store("a", { total: 1, distanceKm: 3 }), store("b", { total: 2, distanceKm: 2 }), store("c", { total: 3, distanceKm: 1 })];
    const perms = [[0, 1, 2], [2, 1, 0], [1, 2, 0], [1, 0, 2]];
    for (const sort of ["price", "distance", "coverage"] as Sort[]) {
      const expected = ids(sortStores(s, sort));
      for (const p of perms) expect(ids(sortStores(p.map((i) => s[i]), sort))).toEqual(expected);
    }
  });

  it("does not mutate the input and returns a new array", () => {
    const s = [store("b", { distanceKm: 2 }), store("a", { distanceKm: 1 })];
    const out = sortStores(s, "distance");
    expect(ids(s)).toEqual(["b", "a"]);
    expect(out).not.toBe(s);
  });

  it("Infinity distance sorts last (no NaN from Infinity - Infinity is avoided when only one is infinite)", () => {
    expect(ids(sortStores([store("inf", { distanceKm: Infinity }), store("near", { distanceKm: 1 })], "distance"))).toEqual(["near", "inf"]);
  });

  it("BUG sort.ts:13,18 NaN/undefined distanceKm makes the comparator return NaN (treated as 'equal'), so the whole sort becomes input-order dependent and valid stores end up unsorted; fix: normalise `const d = (s) => Number.isFinite(s.distanceKm) ? s.distanceKm : Infinity` and use it in both the distance order and the tie-break", () => {
    const bad = store("nan", { distanceKm: NaN });
    const undef = { ...store("undef"), distanceKm: undefined as unknown as number };
    const input = [store("far", { distanceKm: 9 }), bad, store("near", { distanceKm: 1 }), undef, store("mid", { distanceKm: 4 })];
    expect(ids(sortStores(input, "distance")).slice(0, 3)).toEqual(["near", "mid", "far"]);
    expect(ids(sortStores(input, "price")).slice(0, 3)).toEqual(["near", "mid", "far"]);
  });

  it("BUG sort.ts:12 NaN total (e.g. price data glitch) breaks the price/coverage order the same way; fix: treat non-finite total as Infinity", () => {
    const input = [store("b", { total: 20 }), store("nan", { total: NaN }), store("a", { total: 10 })];
    expect(ids(sortStores(input, "price"))).toEqual(["a", "b", "nan"]);
  });
});

describe("format", () => {
  it("shekels: ₪ prefix and exactly two decimals", () => {
    expect(shekels(0)).toBe("₪0.00");
    expect(shekels(0.5)).toBe("₪0.50");
    expect(shekels(12)).toBe("₪12.00");
    expect(shekels(1234.5)).toBe("₪1234.50");
    expect(shekels(0.004)).toBe("₪0.00");
    expect(shekels(9.999)).toBe("₪10.00");
  });
  it("shekels: no locale-dependent separators (same output under any locale)", () => {
    expect(shekels(1234567.891)).toBe("₪1234567.89");
    expect(shekels(1234.5)).not.toMatch(/[, \s]/);
  });
  it("shekels: leaves negative/NaN/Infinity visible rather than hiding them", () => {
    expect(shekels(NaN)).toBe("₪NaN");
    expect(shekels(Infinity)).toBe("₪Infinity");
  });
  it.skip("LOW format.ts:3 negative amounts render '₪-1.00' (sign after the symbol); not reachable today (prices are > 0); fix: put '-' before ₪ if refunds are ever shown", () => {
    expect(shekels(-1)).toBe("-₪1.00");
  });

  describe("fmt", () => {
    it("replaces named placeholders, including repeats and numbers (0 is kept)", () => {
      expect(fmt("Has {n} of {m}", { n: 0, m: 5 })).toBe("Has 0 of 5");
      expect(fmt("{a}{a}-{b}", { a: "x", b: 1 })).toBe("xx-1");
    });
    it("leaves unknown placeholders untouched and ignores extra vars", () => {
      expect(fmt("Hi {name}, {x}", { name: "A", unused: 1 })).toBe("Hi A, {x}");
    });
    it("does not treat $-patterns in values specially", () => {
      expect(fmt("{v}", { v: "$& $1 $$" })).toBe("$& $1 $$");
    });
    it("works with Hebrew templates and Hebrew values", () => {
      expect(fmt("ניווט ל{store} ב-Waze", { store: "שופרסל" })).toBe("ניווט לשופרסל ב-Waze");
    });
    it("empty vars returns the string unchanged; non-placeholder braces survive", () => {
      expect(fmt("{a} { b } {}", {})).toBe("{a} { b } {}");
    });
  });

  // NOTE: there is no distance/meters-vs-km formatter in format.ts (StoreCard uses distanceKm.toFixed(1) inline) - nothing to test.
});
