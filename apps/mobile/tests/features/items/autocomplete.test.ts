import { describe, expect, it } from "vitest";
import { suggestCategories, suggestItems } from "@/features/items/autocomplete";

const cats = ["Dairy", "Drinks", "Bakery", "dessert", "Vegetables"];

describe("suggestCategories", () => {
  it("matches by prefix, case-insensitive, keeping usage order", () => {
    expect(suggestCategories("d", cats).matches).toEqual(["Dairy", "Drinks", "dessert"]);
    expect(suggestCategories("DR", cats).matches).toEqual(["Drinks"]);
    expect(suggestCategories("airy", cats).matches).toEqual([]);
  });

  it("offers to create the typed text when nothing matches exactly", () => {
    expect(suggestCategories("Da", cats).create).toBe("Da");
    expect(suggestCategories("  Frozen ", cats)).toEqual({ matches: [], create: "Frozen" });
  });

  it("does not offer create on an exact (case-insensitive) match or empty input", () => {
    expect(suggestCategories("dairy", cats).create).toBeNull();
    expect(suggestCategories("", cats)).toEqual({ matches: cats, create: null });
  });

  it("caps the number of matches", () => {
    expect(suggestCategories("", cats, 2).matches).toEqual(["Dairy", "Drinks"]);
  });

  it("handles Hebrew input", () => {
    const he = ["ירקות", "יין", "מוצרי חלב", "מאפים"];
    expect(suggestCategories("י", he).matches).toEqual(["ירקות", "יין"]);
    expect(suggestCategories("מוצרי", he)).toEqual({ matches: ["מוצרי חלב"], create: "מוצרי" });
    expect(suggestCategories("יין", he).create).toBeNull();
  });
});

describe("suggestItems", () => {
  const items = [
    { id: 1, name: "Milk 3%" },
    { id: 2, name: "milk 1%" },
    { id: 3, name: "Bread" },
    { id: 4, name: "Milk 3%" },
  ];

  it("returns prefix matches as items, first item per name", () => {
    expect(suggestItems("mil", items).matches.map((i) => i.id)).toEqual([1, 2]);
  });

  it("matches anywhere in the name, prefix matches first", () => {
    const he = [{ id: 1, name: "שוקו חלב" }, { id: 2, name: "חלב 3%" }, { id: 3, name: "לחם" }];
    expect(suggestItems("חלב", he).matches.map((i) => i.id)).toEqual([2, 1]);
    expect(suggestItems("3%", he).matches.map((i) => i.id)).toEqual([2]);
  });

  it("folds Hebrew final letters when matching", () => {
    expect(suggestItems("לחמ", [{ name: "לחם" }])).toEqual({ matches: [{ name: "לחם" }], create: null });
  });

  it("offers create unless an item has exactly that name", () => {
    expect(suggestItems("Milk", items).create).toBe("Milk");
    expect(suggestItems("bread", items)).toEqual({ matches: [items[2]], create: null });
  });

  it("suggests nothing for empty input", () => {
    expect(suggestItems("  ", items)).toEqual({ matches: [], create: null });
  });
});
