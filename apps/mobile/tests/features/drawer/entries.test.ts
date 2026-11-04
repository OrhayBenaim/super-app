import { describe, expect, it } from "vitest";
import { currentEntry, DRAWER_SECTIONS } from "@/features/drawer/entries";

describe("drawer entries", () => {
  it("lists the sections in order with their entries", () => {
    expect(DRAWER_SECTIONS.map((s) => [s.key, s.entries.map((e) => e.key)])).toEqual([
      ["shopping", ["list", "compare"]],
      ["lists", ["share", "recent", "items"]],
      ["account", ["settings"]],
    ]);
  });

  it("marks the page for a route", () => {
    expect(currentEntry("/")).toBe("list");
    expect(currentEntry("/compare")).toBe("compare");
    expect(currentEntry("/items")).toBe("items");
    expect(currentEntry("/settings")).toBe("settings");
  });

  it("marks nothing on pages without an entry", () => {
    expect(currentEntry("/recent")).toBeNull();
    expect(currentEntry("/share")).toBeNull();
  });
});
