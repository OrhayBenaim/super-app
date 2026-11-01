import { describe, expect, it } from "vitest";
import { groupByCategory, initials, recentlyBought } from "./group";

const item = (name: string, category: string) => ({ name, category });

describe("groupByCategory", () => {
  it("orders groups by category usage, then unknown categories alphabetically", () => {
    const items = [item("milk", "Dairy"), item("zucchini", "Veg"), item("soap", "Cleaning"), item("bread", "Bakery"), item("apple", "Fruit")];
    expect(groupByCategory(items, ["Veg", "Dairy"]).map((g) => g.category)).toEqual(["Veg", "Dairy", "Bakery", "Cleaning", "Fruit"]);
  });

  it("sorts items by name and counts them", () => {
    const groups = groupByCategory([item("yogurt", "Dairy"), item("cheese", "Dairy"), item("milk", "Dairy")], ["Dairy"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].items.map((i) => i.name)).toEqual(["cheese", "milk", "yogurt"]);
  });

  it("keeps categories case-sensitive and handles empty input", () => {
    expect(groupByCategory([item("a", "dairy"), item("b", "Dairy")], ["Dairy"]).map((g) => g.category)).toEqual(["Dairy", "dairy"]);
    expect(groupByCategory([], ["Dairy"])).toEqual([]);
  });

  it("works with Hebrew names and categories", () => {
    const groups = groupByCategory([item("עגבניה", "ירקות"), item("מלפפון", "ירקות"), item("חלב", "מוצרי חלב")], ["מוצרי חלב"]);
    expect(groups.map((g) => g.category)).toEqual(["מוצרי חלב", "ירקות"]);
    expect(groups[1].items.map((i) => i.name)).toEqual(["מלפפון", "עגבניה"]);
  });
});

describe("recentlyBought", () => {
  it("returns the newest non-missing items, capped", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: i, missing: i === 7, updatedAt: `2026-01-0${i + 1}` }));
    expect(recentlyBought(items).map((i) => i.id)).toEqual([6, 5, 4, 3, 2]);
  });
});

it("initials", () => {
  expect(initials("dana cohen levi")).toBe("DC");
  expect(initials("  נועה ")).toBe("נ");
});

it("recentlyBought keeps only items updated since the cutoff", () => {
  const items = [
    { id: 1, missing: false, updatedAt: "2026-11-01T10:00:00.000Z" },
    { id: 2, missing: false, updatedAt: "2026-10-30T10:00:00.000Z" },
    { id: 3, missing: true, updatedAt: "2026-11-01T11:00:00.000Z" },
  ];
  expect(recentlyBought(items, 10, Date.parse("2026-10-31T10:00:00.000Z")).map((i) => i.id)).toEqual([1]);
});
