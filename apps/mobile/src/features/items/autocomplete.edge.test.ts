import { describe, expect, it } from "vitest";
import { suggestCategories } from "./autocomplete";

describe("suggestCategories edge cases", () => {
  const cats = ["Dairy", "Bakery", "Dairy Free", "Pantry"];

  it("is prefix-only: substrings in the middle of a name do not match", () => {
    expect(suggestCategories("free", cats).matches).toEqual([]);
    expect(suggestCategories("akery", cats).matches).toEqual([]);
    expect(suggestCategories("dairy f", cats).matches).toEqual(["Dairy Free"]);
  });

  it("exact match is case-insensitive and hides create, but still lists the match", () => {
    expect(suggestCategories("DAIRY", cats)).toEqual({ matches: ["Dairy", "Dairy Free"], create: null });
    expect(suggestCategories("pantry", cats)).toEqual({ matches: ["Pantry"], create: null });
  });

  it("trims leading/trailing whitespace for matching and for the create text", () => {
    expect(suggestCategories("   dairy\t", cats).create).toBeNull();
    expect(suggestCategories("\n Snacks  ", cats)).toEqual({ matches: [], create: "Snacks" });
  });

  it("whitespace-only input is treated as empty: all categories (capped), no create", () => {
    expect(suggestCategories("   ", cats, 2)).toEqual({ matches: ["Dairy", "Bakery"], create: null });
  });

  it("create preserves the typed casing (not the normalised one)", () => {
    expect(suggestCategories("FrOzEn", cats).create).toBe("FrOzEn");
  });

  it("default cap is 5, custom cap and zero cap are honoured", () => {
    const many = Array.from({ length: 9 }, (_, i) => `Cat${i}`);
    expect(suggestCategories("cat", many).matches).toHaveLength(5);
    expect(suggestCategories("cat", many, 7).matches).toHaveLength(7);
    expect(suggestCategories("cat", many, 0).matches).toEqual([]);
    expect(suggestCategories("cat", many).matches).toEqual(many.slice(0, 5));
  });

  it("an exact match beyond the cap still suppresses create", () => {
    const many = [...Array.from({ length: 6 }, (_, i) => `Cat${i}x`), "Cat"];
    const r = suggestCategories("cat", many, 2);
    expect(r.matches).toHaveLength(2);
    expect(r.create).toBeNull();
  });

  it("empty category list", () => {
    expect(suggestCategories("x", [])).toEqual({ matches: [], create: "x" });
    expect(suggestCategories("", [])).toEqual({ matches: [], create: null });
  });

  it("case-insensitive Latin incl. accents", () => {
    expect(suggestCategories("CAFÉ", ["café noir"]).matches).toEqual(["café noir"]);
  });

  it("Hebrew: same-form prefix and exact match work; words with a final form match typed final form", () => {
    const he = ["לחם", "לחמניות", "מים"];
    expect(suggestCategories("לח", he).matches).toEqual(["לחם", "לחמניות"]);
    expect(suggestCategories("לחם", he)).toEqual({ matches: ["לחם"], create: null });
    expect(suggestCategories("מים", he).create).toBeNull();
  });

  it("Hebrew: leading/trailing whitespace and no case folding side effects", () => {
    expect(suggestCategories("  מים ", ["מים"])).toEqual({ matches: ["מים"], create: null });
  });

  it("LOW autocomplete.ts:1 final letter forms are not folded (ם/מ, ן/נ, ך/כ, ף/פ, ץ/צ): typing the non-final form at word end neither matches nor counts as exact, so a duplicate category 'לחמ' is offered; fix: map finals to base letters in norm()", () => {
    expect(suggestCategories("לחמ", ["לחם"]).create).toBeNull();
  });
});
