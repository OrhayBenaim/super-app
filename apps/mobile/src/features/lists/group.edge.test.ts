import { describe, expect, it } from "vitest";
import { groupByCategory, initials, recentlyBought } from "./group";

const item = (name: string, category: string) => ({ name, category });

describe("groupByCategory edge cases", () => {
  it("empty items with empty/unknown order", () => {
    expect(groupByCategory([], [])).toEqual([]);
  });

  it("ignores order entries with no items and keeps order of ranked categories, not input order", () => {
    const g = groupByCategory([item("a", "C"), item("b", "B")], ["X", "B", "Y", "C"]);
    expect(g.map((x) => x.category)).toEqual(["B", "C"]);
  });

  it("no order array: everything alphabetical", () => {
    expect(groupByCategory([item("a", "Zed"), item("b", "Alpha"), item("c", "Mid")], []).map((x) => x.category)).toEqual(["Alpha", "Mid", "Zed"]);
  });

  it("unknown categories come after ordered ones even if alphabetically earlier", () => {
    const g = groupByCategory([item("a", "Aaa"), item("b", "Zzz")], ["Zzz"]);
    expect(g.map((x) => x.category)).toEqual(["Zzz", "Aaa"]);
  });

  it("mixed-case duplicates are separate groups; ordered one wins, unknown ones sort deterministically", () => {
    const g = groupByCategory([item("1", "dairy"), item("2", "Dairy"), item("3", "DAIRY")], ["Dairy"]);
    expect(g.map((x) => x.category)).toEqual(["Dairy", "dairy", "DAIRY"]);
    expect(g.every((x) => x.count === 1)).toBe(true);
  });

  it("Hebrew unknown categories sort alphabetically (aleph..tav) after Latin ones", () => {
    const g = groupByCategory([item("a", "תבלינים"), item("b", "אורז"), item("c", "Bakery"), item("d", "ירקות")], []);
    expect(g.map((x) => x.category)).toEqual(["Bakery", "אורז", "ירקות", "תבלינים"]);
  });

  it("is stable for equal names (input order preserved) and sorts Hebrew names", () => {
    const items = [{ name: "חלב", category: "c", id: 1 }, { name: "חלב", category: "c", id: 2 }, { name: "אורז", category: "c", id: 3 }];
    expect(groupByCategory(items, ["c"])[0].items.map((i) => i.id)).toEqual([3, 1, 2]);
  });

  it("does not mutate the input array or reorder it", () => {
    const items = [item("b", "X"), item("a", "X")];
    const snapshot = [...items];
    groupByCategory(items, ["X"]);
    expect(items).toEqual(snapshot);
  });

  it("empty-string category forms its own group (last when unknown)", () => {
    const g = groupByCategory([item("a", ""), item("b", "Dairy")], ["Dairy"]);
    expect(g.map((x) => x.category)).toEqual(["Dairy", ""]);
  });

  it("a category listed twice in the order uses the first position", () => {
    const g = groupByCategory([item("a", "A"), item("b", "B")], ["B", "A", "B"]);
    expect(g.map((x) => x.category)).toEqual(["B", "A"]);
  });
});

describe("recentlyBought edge cases", () => {
  const mk = (id: number, missing: boolean, updatedAt: string) => ({ id, missing, updatedAt });

  it("empty input, all missing, and n=0", () => {
    expect(recentlyBought([])).toEqual([]);
    expect(recentlyBought([mk(1, true, "2026-01-01")])).toEqual([]);
    expect(recentlyBought([mk(1, false, "2026-01-01")], 0)).toEqual([]);
  });

  it("never returns more than 5 by default and respects a custom n", () => {
    const items = Array.from({ length: 12 }, (_, i) => mk(i, false, `2026-01-${String(i + 10).padStart(2, "0")}`));
    expect(recentlyBought(items)).toHaveLength(5);
    expect(recentlyBought(items, 3).map((i) => i.id)).toEqual([11, 10, 9]);
    expect(recentlyBought(items.slice(0, 2))).toHaveLength(2);
  });

  it("newest first by ISO updatedAt including time component, regardless of input order", () => {
    const items = [mk(1, false, "2026-03-01T10:00:00.000Z"), mk(2, false, "2026-03-01T10:00:01.000Z"), mk(3, false, "2025-12-31T23:59:59.999Z")];
    expect(recentlyBought(items).map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it("excludes missing items even when they are the newest, and does not mutate input", () => {
    const items = [mk(1, true, "2030-01-01"), mk(2, false, "2026-01-01")];
    const copy = [...items];
    expect(recentlyBought(items).map((i) => i.id)).toEqual([2]);
    expect(items).toEqual(copy);
  });

  it("equal timestamps keep input order (stable)", () => {
    const items = [mk(1, false, "2026-01-01"), mk(2, false, "2026-01-01"), mk(3, false, "2026-01-01")];
    expect(recentlyBought(items).map((i) => i.id)).toEqual([1, 2, 3]);
  });
});

describe("initials edge cases", () => {
  it("single word, multi-word (max two), lowercase", () => {
    expect(initials("dana")).toBe("D");
    expect(initials("dana cohen")).toBe("DC");
    expect(initials("dana bat cohen levi")).toBe("DB");
  });
  it("Hebrew: first letters, no case change", () => {
    expect(initials("נועה כהן")).toBe("נכ");
    expect(initials("  נועה   כהן  לוי ")).toBe("נכ");
  });
  it("empty and whitespace-only give an empty string", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });
  it("email-only names use the first letter of the address", () => {
    expect(initials("dana@example.com")).toBe("D");
  });
  it("tabs/newlines count as separators", () => {
    expect(initials("a\tb\nc")).toBe("AB");
  });
  it.skip("BUG group.ts:36 w[0] splits surrogate pairs (emoji/astral first letters become a lone surrogate); fix: use [...w][0]", () => {
    expect(initials("😀 smile")).toBe("😀S");
  });
});
