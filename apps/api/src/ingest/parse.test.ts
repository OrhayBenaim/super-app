import { readFileSync } from "node:fs";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { nominatimUrl, parseNominatim } from "./geocode.js";
import { decodeXml, parsePrices, parseStores } from "./parse.js";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));

describe("parse", () => {
  it("reads a UTF-16LE Stores file with BOM", () => {
    const { chainId, stores } = parseStores(decodeXml(fixture("Stores7290103152017-000-20261021-080500.xml")));
    expect(chainId).toBe("7290103152017");
    expect(stores).toHaveLength(4);
    expect(stores[0]).toEqual({ storeId: "1", subChainId: "1", name: "אשדוד", address: "הרצל 11", city: "אשדוד" });
  });

  it("reads a gzipped UTF-8 PriceFull with typed values", () => {
    const { chainId, storeId, items } = parsePrices(decodeXml(fixture("PriceFull7290103152017-001-001-20261021-051600.gz")));
    expect([chainId, storeId, items.length]).toEqual(["7290103152017", "1", 4]);
    expect(items[0]).toEqual({
      code: "7290000000001",
      name: "חלב תנובה 3%",
      manufacturer: "תנובה",
      unitQty: "1 ליטר",
      isWeighted: false,
      price: 6,
      unitPrice: 0.6,
    });
    expect(items[1]!.manufacturer).toBe("אנג'ל"); // entity decoded
    expect(items[2]!.manufacturer).toBeNull();
    expect(items[3]).toMatchObject({ code: "2001", isWeighted: true, price: 8.9 });
  });

  it("reads a plain file with ChainID/StoreID casing and unpadded ids", () => {
    const parsed = parsePrices(decodeXml(fixture("PriceFull7290103152017-001-002-20261021-051600.xml")));
    expect(parsed).toMatchObject({ chainId: "7290103152017", storeId: "2", items: [{ price: 5.5 }, { price: 11 }] });
  });

  it("reads the root/Products/Product/ItemNm/ManufactureName dialect", () => {
    const parsed = parsePrices(decodeXml(fixture("PriceFull7290103152017-001-003-variants.xml")));
    expect(parsed.storeId).toBe("3");
    expect(parsed.items.map((i) => [i.name, i.manufacturer])).toEqual([
      ["חלב תנובה 3%", "תנובה"],
      ["לחם אחיד פרוס", "אנג'ל"],
      ["גבינה צהובה 28%", "גד"],
    ]);
  });

  it("unzips a zip named .gz and strips a UTF-8 BOM", () => {
    const xml = "﻿<Root><ChainId>7290058140886</ChainId><StoreId>039</StoreId><Items><Item><ItemCode>1</ItemCode><ItemPrice>2.5</ItemPrice></Item></Items></Root>";
    const zip = Buffer.from(zipSync({ "a.xml": new TextEncoder().encode(xml) }));
    expect(parsePrices(decodeXml(zip))).toMatchObject({ storeId: "39", items: [{ code: "1", name: "1", price: 2.5 }] });
  });

  it("builds the Nominatim query and parses its answer", () => {
    expect(nominatimUrl("הרצל 11", "אשדוד")).toBe(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent("הרצל 11, אשדוד, Israel")}`,
    );
    const q = (address: string, city: string, name?: string) => decodeURIComponent(nominatimUrl(address, city, name)?.split("&q=")[1] ?? "") || null;
    expect(q("האומן,15", "ירושלים")).toBe("האומן 15, ירושלים, Israel");
    expect(q("הנדיב 71 הרצליה", "הרצליה", "פרשמרקט הנדיב")).toBe("הנדיב 71 הרצליה, Israel"); // city already in the address
    expect(q("רחוב המפוח 11, אזור התעשיה", "", "יוחננוף מפוח")).toBe("רחוב המפוח 11, אזור התעשיה, יוחננוף מפוח, Israel");
    expect(q("האומן 5", "1015", "תלפיות")).toBe("האומן 5, תלפיות, Israel"); // undecoded CBS code counts as no city
    expect(q("", "", "יוחננוף בילו")).toBe("יוחננוף בילו, Israel");
    expect(q("", "", "")).toBeNull();
    expect(parseNominatim([{ lat: "31.80", lon: "34.65" }])).toEqual({ lat: 31.8, lng: 34.65 });
    expect(parseNominatim([])).toBeNull();
  });
});
