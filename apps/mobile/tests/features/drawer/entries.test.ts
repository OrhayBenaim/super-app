import { describe, expect, it } from "vitest";
import { currentEntry, DRAWER_SECTIONS } from "@/features/drawer/entries";

describe("drawer entries", () => {
  it("lists the sections in order with their entries", () => {
    expect(DRAWER_SECTIONS.map((s) => [s.key, s.entries.map((e) => e.key)])).toEqual([
      ["shopping", ["home", "list", "promotions", "compare"]],
      ["lists", ["share", "recent", "items"]],
      ["account", ["settings"]],
    ]);
  });

  it("marks the page for a route", () => {
    expect(currentEntry("/")).toBe("home");
    expect(currentEntry("/list")).toBe("list");
    expect(currentEntry("/type/dairy-eggs")).toBe("home");
    expect(currentEntry("/group/%D7%97%D7%9C%D7%91%7Cl")).toBe("home");
    expect(currentEntry("/promotions")).toBe("promotions");
    expect(currentEntry("/promotions/group/%D7%97%D7%9C%D7%91%7Cl")).toBe("promotions");
    expect(currentEntry("/compare")).toBe("compare");
    expect(currentEntry("/items")).toBe("items");
    expect(currentEntry("/settings")).toBe("settings");
  });

  it("marks nothing on pages without an entry", () => {
    expect(currentEntry("/recent")).toBeNull();
    expect(currentEntry("/share")).toBeNull();
  });
});
