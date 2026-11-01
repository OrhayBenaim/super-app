// Real files fetched 2026-11-01 (npm run fetch), truncated to <=5 stores / 50 items with their tags and encoding kept.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chainSeeds } from "./chains.js";
import { decodeXml, parsePrices, parseStores } from "./parse.js";

const read = (name: string) => decodeXml(readFileSync(new URL(`./__fixtures__/real/${name}`, import.meta.url)));
const idOf = (key: string) => chainSeeds.find((c) => c.key === key)!.ids[0];

// [chainKey, stores file, store count, first store, prices file, StoreId, first item]
const cases: [string, string, number, object, string, string, object][] = [
  ["shufersal", "shufersal-stores.gz", 4, { storeId: "756", subChainId: "1", city: "באר יעקב" }, "shufersal-pricefull.gz", "1", { code: "10900302814", price: 10, unitPrice: 0.33 }],
  ["rami-levy", "rami-levy-stores.xml", 5, { storeId: "1", name: "תלפיות", address: "האומן,15", city: "ירושלים" }, "rami-levy-pricefull.gz", "1", { code: "7290017023212", price: 12.5, unitQty: null }],
  ["yohananof", "yohananof-stores.xml", 5, { storeId: "1", city: "" }, "yohananof-pricefull.gz", "1", { code: "1022788", price: 139, isWeighted: true }],
  ["osher-ad", "osher-ad-stores.xml", 5, { storeId: "1", name: "מגדל העמק", city: "874" }, "osher-ad-pricefull.gz", "1", { code: "7290001041017", price: 5.8, unitQty: "50 גרם" }],
  ["tiv-taam", "tiv-taam-stores.xml", 5, { storeId: "2", city: "נתניה" }, "tiv-taam-pricefull.gz", "2", { code: "1101346", price: 145, manufacturer: null }],
  ["keshet", "keshet-stores.xml", 5, { storeId: "2", name: "נהריה" }, "keshet-pricefull.gz", "14", { code: "7290000001015", price: 99, unitQty: null }],
  ["stop-market", "stop-market-stores.xml", 5, { storeId: "2", name: "ארנה", city: "הרצליה" }, "stop-market-pricefull.gz", "2", { code: "7290000288024", price: 17.5 }],
  ["dor-alon", "dor-alon-stores.xml", 4, { storeId: "501", city: "תל אביב" }, "dor-alon-pricefull.gz", "401", { code: "7290000149905", price: 16.9 }],
  ["fresh-market", "fresh-market-stores.xml", 5, { storeId: "1", name: "פרשמרקט גליל ים" }, "fresh-market-pricefull.gz", "1", { code: "8002230000012", price: 109.9, manufacturer: null }],
  ["politzer", "politzer-stores.xml", 5, { storeId: "1", address: 'רמב"ם 24' }, "politzer-pricefull.gz", "1", { code: "7290000000135", price: 16.9 }],
  ["salach-dabach", "salach-dabach-stores.xml", 5, { storeId: "4", name: "מגדל" }, "salach-dabach-pricefull.gz", "4", { code: "7290000131009", price: 16.9 }],
];

describe.each(cases)("real %s files", (key, storesFile, storeCount, firstStore, pricesFile, storeId, firstItem) => {
  it("parses the Stores file", () => {
    const { chainId, stores } = parseStores(read(storesFile));
    expect(chainId).toBe(idOf(key));
    expect(stores).toHaveLength(storeCount);
    expect(stores[0]).toMatchObject(firstStore);
  });

  it("parses the PriceFull file", () => {
    const { chainId, storeId: sid, items } = parsePrices(read(pricesFile));
    expect([chainId, sid, items.length]).toEqual([idOf(key), storeId, 50]);
    expect(items[0]).toMatchObject(firstItem);
  });
});

describe("real dialect quirks", () => {
  it("reads every SubChain of a multi-sub-chain Stores file (Dor Alon, Shufersal)", () => {
    expect(new Set(parseStores(read("dor-alon-stores.xml")).stores.map((s) => s.subChainId))).toEqual(new Set(["1", "2"]));
    expect(new Set(parseStores(read("shufersal-stores.gz")).stores.map((s) => s.subChainId))).toEqual(new Set(["1", "15"]));
  });

  it("reads Keshet's 3-segment file (ChainId/StoreId, PriceUpdateDate, ManufacturerName, 'Unknown' unit)", () => {
    const { chainId, storeId, items } = parsePrices(read("keshet-pricefull-3seg.gz"));
    expect([chainId, storeId]).toEqual(["7290785400000", "2"]);
    expect(items[0]).toEqual({ code: "7290000010003", name: "לחם גבטה", manufacturer: "בונז'ור", unitQty: null, isWeighted: false, price: 4.9, unitPrice: 0 });
  });
});
