import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn(), BASE_URL: "https://api.grocer.test" }));

import { resolveScan } from "@/features/items/scan";
import type { Item } from "@/features/lists/api";
import { api } from "@/lib/api";

const product = (code: string, name = `p${code}`) => ({ kind: "product", code, name, manufacturer: null, unitQty: null, measure: null, size: null, soldBy: "unit", storeCount: 2, minPrice: 5 });
const item = (over: Partial<Item>): Item => ({ id: "i1", listId: "l1", name: "Milk", category: "Other", productCode: null, groupRef: null, missing: true, quantity: 2, soldBy: "unit", createdAt: "", updatedAt: "", ...over });
const searchReturns = (results: unknown[]) => vi.mocked(api).mockResolvedValueOnce(results);

beforeEach(() => vi.mocked(api).mockReset());

describe("resolveScan", () => {
  it("finds the 12-digit stored Barcode from a 13-digit reading starting with 0", async () => {
    searchReturns([product("123456789012", "Cola")]);
    expect(await resolveScan("0123456789012", [])).toEqual({ kind: "added", product: { code: "123456789012", name: "Cola" } });
  });

  it("is unknown when the search finds only Products whose code starts with the reading", async () => {
    searchReturns([product("72900000123451"), product("72900000123452")]);
    expect(await resolveScan("7290000012345", [])).toEqual({ kind: "unknown" });
  });

  it("is unknown when no store prices the Barcode (an empty search)", async () => {
    searchReturns([]);
    expect(await resolveScan("7290000012345", [])).toEqual({ kind: "unknown" });
  });

  it("finds a UPC-A stored as 11 digits from its 12-digit reading", async () => {
    searchReturns([product("12345678905", "Chips")]);
    expect(await resolveScan("012345678905", [])).toEqual({ kind: "added", product: { code: "12345678905", name: "Chips" } });
  });

  it("finds a UPC-A stored as 11 digits from its 13-digit iOS reading", async () => {
    searchReturns([product("12345678905", "Chips")]);
    expect(await resolveScan("0012345678905", [])).toEqual({ kind: "added", product: { code: "12345678905", name: "Chips" } });
  });

  it("adds the scanned Product, never the Product group the search ranks first", async () => {
    searchReturns([
      { kind: "group", ref: "cola|l", name: "Cola", measure: "l", size: 1.5, soldBy: "unit", productCount: 4, storeCount: 3, minPrice: 6, refinements: [], topCodes: ["7290011111111"] },
      product("7290011111111", "Cola Zero 1.5L"),
    ]);
    expect(await resolveScan("7290011111111", [])).toEqual({ kind: "added", product: { code: "7290011111111", name: "Cola Zero 1.5L" } });
  });

  it("is alreadyOnList when an Item matched to the Product is on the List", async () => {
    searchReturns([product("7290011111111", "Cola")]);
    const onList = item({ id: "cola", name: "My cola", productCode: "7290011111111", missing: true });
    const other = item({ id: "milk", productCode: "7290022222222", missing: true });
    expect(await resolveScan("7290011111111", [other, onList])).toEqual({ kind: "alreadyOnList", item: onList });
  });

  it("is returned when the Item matched to the Product is checked off or off the List", async () => {
    searchReturns([product("7290011111111", "Cola")]);
    const off = item({ id: "cola", name: "My cola", productCode: "7290011111111", missing: false, quantity: 3 });
    expect(await resolveScan("7290011111111", [off])).toEqual({ kind: "returned", item: off });
  });

  it("adds the Product when an Item only shares its name or its Product group", async () => {
    searchReturns([product("7290011111111", "Cola")]);
    const byGroup = item({ id: "g", name: "Cola", groupRef: "cola|l", productCode: null });
    expect(await resolveScan("7290011111111", [byGroup])).toEqual({ kind: "added", product: { code: "7290011111111", name: "Cola" } });
  });

  it("is unknown for a reading of only 0s, without searching", async () => {
    expect(await resolveScan("00000000", [])).toEqual({ kind: "unknown" });
    expect(api).not.toHaveBeenCalled();
  });

  it("throws when Grocer's search fails", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("500"));
    await expect(resolveScan("7290011111111", [])).rejects.toThrow("500");
  });
});
