import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn(), BASE_URL: "https://api.grocer.test" }));

import { pricesNearby, resolveScan, storeLabel } from "@/features/items/scan";
import type { Item } from "@/features/lists/api";
import { api } from "@/lib/api";

const product = (code: string, name = `p${code}`) => ({ kind: "product", code, name, manufacturer: null, unitQty: null, measure: "l", size: 1.5, soldBy: "unit", type: "drinks", storeCount: 2, minPrice: 5 });
const item = (over: Partial<Item>): Item => ({ id: "i1", listId: "l1", name: "Milk", category: "Other", productCode: null, groupRef: null, missing: true, quantity: 2, soldBy: "unit", createdAt: "", updatedAt: "", ...over });
const found = (code: string, name: string, action: string, item?: Item) => ({ kind: "found", product: { code, name, measure: "l", size: 1.5, soldBy: "unit", type: "drinks" }, action, ...(item && { item }) });
const searchReturns = (results: unknown[]) => vi.mocked(api).mockResolvedValueOnce(results);

const off = vi.fn<typeof fetch>();
const offReturns = (body: unknown) => off.mockResolvedValueOnce(new Response(JSON.stringify(body)));

beforeEach(() => {
  vi.mocked(api).mockReset();
  off.mockReset();
  // Open Food Facts knows no product unless a test says so.
  off.mockImplementation(async () => new Response(JSON.stringify({ status: 0 })));
  vi.stubGlobal("fetch", off);
});

describe("resolveScan", () => {
  it("finds the 12-digit stored Barcode from a 13-digit reading starting with 0", async () => {
    searchReturns([product("123456789012", "Cola")]);
    expect(await resolveScan("0123456789012", [])).toEqual(found("123456789012", "Cola", "add"));
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
    expect(await resolveScan("012345678905", [])).toEqual(found("12345678905", "Chips", "add"));
  });

  it("finds a UPC-A stored as 11 digits from its 13-digit iOS reading", async () => {
    searchReturns([product("12345678905", "Chips")]);
    expect(await resolveScan("0012345678905", [])).toEqual(found("12345678905", "Chips", "add"));
  });

  it("adds the scanned Product, never the Product group the search ranks first", async () => {
    searchReturns([
      { kind: "group", ref: "cola|l", name: "Cola", measure: "l", size: 1.5, soldBy: "unit", productCount: 4, storeCount: 3, minPrice: 6, refinements: [], topCodes: ["7290011111111"] },
      product("7290011111111", "Cola Zero 1.5L"),
    ]);
    expect(await resolveScan("7290011111111", [])).toEqual(found("7290011111111", "Cola Zero 1.5L", "add"));
  });

  it("is found with action onList when an Item matched to the Product is on the List", async () => {
    searchReturns([product("7290011111111", "Cola")]);
    const onList = item({ id: "cola", name: "My cola", productCode: "7290011111111", missing: true });
    const other = item({ id: "milk", productCode: "7290022222222", missing: true });
    expect(await resolveScan("7290011111111", [other, onList])).toEqual(found("7290011111111", "Cola", "onList", onList));
  });

  it("is found with action return when the Item matched to the Product is checked off or off the List", async () => {
    searchReturns([product("7290011111111", "Cola")]);
    const off = item({ id: "cola", name: "My cola", productCode: "7290011111111", missing: false, quantity: 3 });
    expect(await resolveScan("7290011111111", [off])).toEqual(found("7290011111111", "Cola", "return", off));
  });

  it("adds the Product when an Item only shares its name or its Product group", async () => {
    searchReturns([product("7290011111111", "Cola")]);
    const byGroup = item({ id: "g", name: "Cola", groupRef: "cola|l", productCode: null });
    expect(await resolveScan("7290011111111", [byGroup])).toEqual(found("7290011111111", "Cola", "add"));
  });

  it("is unknown for a reading of only 0s, without searching", async () => {
    expect(await resolveScan("00000000", [])).toEqual({ kind: "unknown" });
    expect(api).not.toHaveBeenCalled();
  });

  it("throws when Grocer's search fails", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("500"));
    await expect(resolveScan("7290011111111", [])).rejects.toThrow("500");
  });

  describe("when Grocer's search finds nothing", () => {
    beforeEach(() => searchReturns([]));

    it("is named with Open Food Facts' product_name_he", async () => {
      offReturns({ status: 1, product: { product_name_he: "במבה", product_name: "Bamba" } });
      expect(await resolveScan("7290000066318", [])).toEqual({ kind: "named", name: "במבה" });
      expect(new Headers(off.mock.calls[0]![1]?.headers).get("User-Agent")).toMatch(/^Grocer\//);
    });

    it("is named with a product_name in Hebrew when there is no product_name_he", async () => {
      offReturns({ status: 1, product: { product_name: "ביסלי גריל" } });
      expect(await resolveScan("7290000066318", [])).toEqual({ kind: "named", name: "ביסלי גריל" });
    });

    it("is unknown when the only name is not in Hebrew", async () => {
      offReturns({ status: 1, product: { product_name_he: "", product_name: "Bamba 80g" } });
      expect(await resolveScan("7290000066318", [])).toEqual({ kind: "unknown" });
    });

    it("is unknown when Open Food Facts has no such product", async () => {
      off.mockResolvedValueOnce(new Response(JSON.stringify({ status: 0, status_verbose: "product not found" }), { status: 404 }));
      expect(await resolveScan("7290000066318", [])).toEqual({ kind: "unknown" });
    });

    it("is unknown when Open Food Facts can't be reached", async () => {
      off.mockRejectedValueOnce(new TypeError("Network request failed"));
      expect(await resolveScan("7290000066318", [])).toEqual({ kind: "unknown" });
    });

    it("is unknown when Open Food Facts takes more than 8 seconds", async () => {
      vi.useFakeTimers();
      try {
        off.mockImplementationOnce((_url, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
        const outcome = resolveScan("7290000066318", []);
        await vi.advanceTimersByTimeAsync(8_000);
        expect(await outcome).toEqual({ kind: "unknown" });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("never asks Open Food Facts when Grocer's search finds the Product", async () => {
    searchReturns([product("7290011111111", "Cola")]);
    await resolveScan("7290011111111", []);
    expect(off).not.toHaveBeenCalled();
  });
});

describe("pricesNearby", () => {
  const CODE = "7290011111111";
  const where = { lat: 32.08, lng: 34.78, radiusKm: 10 };
  const store = (name: string, price: number, distanceKm: number, lineTotal = price, promotion?: object) => ({
    storeId: name, chainId: "c", chainName: name, storeName: `${name} branch`, address: "", city: "", lat: 1, lng: 2, distanceKm,
    total: lineTotal, matched: 1, missingCodes: [], orderUrl: null, fillsCart: false,
    items: [{ code: CODE, price, quantity: 1, lineTotal, ...(promotion && { promotion }) }],
  });
  const compareReturns = (stores: unknown[]) => vi.mocked(api).mockResolvedValueOnce({ stores, unmatched: [] });
  const pricesOf = async (soldBy: "unit" | "weight" = "unit") => (await pricesNearby(CODE, soldBy, where)) as any;
  const names = (ss: { chainName: string }[]) => ss.map((s) => s.chainName);

  it("asks Compare for this one Product at Quantity 1 with the location and radius", async () => {
    compareReturns([]);
    await pricesOf();
    const [path, init] = vi.mocked(api).mock.calls[0]!;
    expect(path).toBe("api/compare");
    expect(JSON.parse(init!.body as string)).toMatchObject({ ...where, items: [{ code: CODE, quantity: 1 }], groups: [] });
  });

  it("heads with the cheapest store, keeps price order below it and does not repeat the headline", async () => {
    compareReturns([store("C", 9, 1), store("A", 5, 3), store("B", 7, 2)]);
    const p = await pricesOf();
    expect(p.kind).toBe("stores");
    expect(p.headline.chainName).toBe("A");
    expect(names(p.others)).toEqual(["B", "C"]);
  });

  it("gives a price tie to the nearer store", async () => {
    compareReturns([store("Far", 5, 4), store("Near", 5, 1)]);
    const p = await pricesOf();
    expect(p.headline.chainName).toBe("Near");
    expect(names(p.others)).toEqual(["Far"]);
  });

  it("carries the Promotion price, its text and the Shelf price only when a Promotion applies", async () => {
    const promotion = { id: "p", kind: "price", minQty: 1, amount: 4, audience: "all", text: "x" };
    compareReturns([store("Promo", 6, 2, 4, promotion), store("Plain", 5.5, 1)]);
    const p = await pricesOf();
    expect(p.headline).toMatchObject({ chainName: "Promo", price: 6, promo: { price: 4 } });
    expect(typeof p.headline.promo.text).toBe("string");
    expect(p.others[0].promo).toBeUndefined();
    expect(p.others[0].price).toBe(5.5);
  });

  it("prices a Product Sold by weight per kilo, its Promotion text in kilos", async () => {
    const promotion = { id: "p", kind: "bundle", minQty: 2, amount: 50, audience: "all", text: "x" };
    compareReturns([store("Deli", 30, 1, 25, promotion)]);
    const p = await pricesOf("weight");
    expect(p.headline).toMatchObject({ price: 30, promo: { price: 25 } });
    expect(p.headline.promo.text).toContain("ק״ג");
  });

  it("is noLocation without calling Compare when location is off", async () => {
    expect(await pricesNearby(CODE, "unit", null)).toEqual({ kind: "noLocation" });
    expect(api).not.toHaveBeenCalled();
  });

  it("is failed when Compare rejects", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("500"));
    expect(await pricesOf()).toEqual({ kind: "failed" });
  });

  it("has no headline when no store prices the Product", async () => {
    compareReturns([]);
    expect(await pricesOf()).toEqual({ kind: "none" });
  });
});

describe("storeLabel", () => {
  const store = { chainName: "Shufersal", storeName: "Dizengoff", distanceKm: 1, lat: 0, lng: 0, price: 10 };
  it("reads the Waze action with the price", () => {
    expect(storeLabel(store)).toBe("ניווט לShufersal Dizengoff ב-Waze, ₪10.00");
  });
  it("reads the Promotion price, then the struck Shelf price as 'instead of'", () => {
    expect(storeLabel({ ...store, promo: { price: 8, text: "2 for 8" } })).toBe("ניווט לShufersal Dizengoff ב-Waze, ₪8.00, במקום ₪10.00");
  });
});
