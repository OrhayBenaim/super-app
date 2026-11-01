import { describe, expect, it } from "vitest";
import { suggestCategories } from "./autocomplete";

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
