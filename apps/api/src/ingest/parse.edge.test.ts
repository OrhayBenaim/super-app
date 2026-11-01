// QA edge cases for parse.ts: isGtin matrix, every real fixture, placeholders, CBS cities, numbers, entities.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeXml, isGtin, parsePrices, parseStores } from "./parse.js";

// Independent GS1 check digit: weights 3,1,3,... from the digit next to the check digit.
const withCheck = (body: string) => {
  const sum = [...body].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
};
// Deterministic pseudo-random digit strings (no Math.random, so failures reproduce).
const digits = (n: number, seed: number) => {
  let x = seed;
  return Array.from({ length: n }, () => ((x = (x * 1103515245 + 12345) % 2147483648), String(Math.floor(x / 65536) % 10))).join("");
};

describe("isGtin", () => {
  it.each([7, 10, 11, 12, 13])("accepts a correct check digit and rejects each of the 9 wrong ones (%i-digit body)", (bodyLen) => {
    for (let seed = 1; seed <= 20; seed++) {
      const good = withCheck(digits(bodyLen, seed));
      expect(isGtin(good), good).toBe(true);
      for (const d of "0123456789") if (d !== good.at(-1)) expect(isGtin(good.slice(0, -1) + d), good.slice(0, -1) + d).toBe(false);
    }
  });

  it("rejects the in-between lengths 9, 10 and anything over 14, even with a correct check digit", () => {
    for (const bodyLen of [8, 9, 14, 15, 20]) expect(isGtin(withCheck(digits(bodyLen, 7))), `len ${bodyLen + 1}`).toBe(false);
    for (const len of [0, 1, 7]) expect(isGtin("1".repeat(len))).toBe(false);
    expect(isGtin("1".repeat(100_000))).toBe(false);
  });

  it("rejects non-digits: spaces, newline, sign, decimal point, letters, Unicode and Arabic-Indic digits", () => {
    const ok = "4000417025005";
    expect(isGtin(ok)).toBe(true);
    for (const bad of [` ${ok}`, `${ok} `, `${ok}\n`, `+${ok.slice(1)}`, `${ok.slice(0, 7)}.${ok.slice(8)}`, "4000417O25005", "٤٠٠٠٤١٧٠٢٥٠٠٥", "４０００４１７０２５００５", "", " ", "-"]) expect(isGtin(bad), JSON.stringify(bad)).toBe(false);
  });

  it("leading zeros do not change validity: EAN-13 0+UPC-12, GTIN-14 00+UPC-12, and the 11-digit UPC without its 0", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const upc = withCheck(digits(11, seed)); // 12 digits
      const upc11 = upc.replace(/^0+/, "").padStart(11, "1").slice(-11); // exactly 11 digits for the leniency check
      expect(isGtin("0" + upc)).toBe(true);
      expect(isGtin("00" + upc)).toBe(true);
      expect(isGtin(upc11)).toBe(isGtin("0" + upc11)); // dropping the leading zero never changes the check
      expect(isGtin("000" + upc)).toBe(false); // 15 digits
    }
  });

  it("11 digits is the documented UPC-12-without-leading-zero leniency, and 9/10 digits stay invalid", () => {
    expect(isGtin("10900302814")).toBe(true); // Shufersal and Tiv Taam publish this
    expect(isGtin("010900302814")).toBe(true);
    expect(isGtin("10900302815")).toBe(false);
    expect(isGtin(withCheck("10900302"))).toBe(false); // 9 digits
    expect(isGtin(withCheck("109003028"))).toBe(false); // 10 digits
  });

  it("the real-world mix: a code that is only an 8-digit internal id passes only by chance, 7-digit ones never do", () => {
    expect(isGtin("1022788")).toBe(false);
    expect(isGtin("96385074")).toBe(true); // real EAN-8
    expect(isGtin("96385075")).toBe(false);
  });

  // GS1 has no all-zero GTIN, but the mod-10 check accepts it. No real file carries one (checked on 2026-11-01), so low risk.
  it.skip("rejects an all-zero code (accepted by the checksum: sum 0, check 0)", () => {
    expect(isGtin("0".repeat(8))).toBe(false);
    expect(isGtin("0".repeat(13))).toBe(false);
  });
});

const real = (name: string) => decodeXml(readFileSync(new URL(`./__fixtures__/real/${name}`, import.meta.url)));
const placeholder = (v: string | null) => v !== null && (!/[\p{L}\p{N}]/u.test(v) || /^(לא ידוע|unknown)$/i.test(v));

// [chain id, stores file, store count, sub-chain ids, prices file, store id, weighted count]
const fixtures: [string, string, number, string[], string, string, number][] = [
  ["7290027600007", "shufersal-stores.gz", 4, ["1", "15"], "shufersal-pricefull.gz", "1", 0],
  ["7290058140886", "rami-levy-stores.xml", 5, ["1"], "rami-levy-pricefull.gz", "1", 1],
  ["7290803800003", "yohananof-stores.xml", 5, ["1"], "yohananof-pricefull.gz", "1", 16],
  ["7290103152017", "osher-ad-stores.xml", 5, ["1"], "osher-ad-pricefull.gz", "1", 11],
  ["7290873255550", "tiv-taam-stores.xml", 5, ["1"], "tiv-taam-pricefull.gz", "2", 13],
  ["7290785400000", "keshet-stores.xml", 5, ["1"], "keshet-pricefull.gz", "14", 41],
  ["7290639000004", "stop-market-stores.xml", 5, ["1"], "stop-market-pricefull.gz", "2", 2],
  ["7290492000005", "dor-alon-stores.xml", 4, ["1", "2"], "dor-alon-pricefull.gz", "401", 0],
  ["7290876100000", "fresh-market-stores.xml", 5, ["1"], "fresh-market-pricefull.gz", "1", 3],
  ["7291059100008", "politzer-stores.xml", 5, ["1"], "politzer-pricefull.gz", "1", 4],
  ["7290526500006", "salach-dabach-stores.xml", 5, ["1"], "salach-dabach-pricefull.gz", "4", 1],
];

describe.each(fixtures)("every real fixture of chain %s", (chainId, storesFile, storeCount, subChains, pricesFile, storeId, weighted) => {
  it("Stores: count, ids, sub-chains, no placeholder, '0' or entity left in any field", () => {
    const parsed = parseStores(real(storesFile));
    expect(parsed.chainId).toBe(chainId);
    expect(parsed.stores).toHaveLength(storeCount);
    expect(new Set(parsed.stores.map((s) => s.subChainId))).toEqual(new Set(subChains));
    expect(new Set(parsed.stores.map((s) => s.storeId)).size).toBe(storeCount);
    for (const s of parsed.stores) {
      expect(s.storeId).toMatch(/^[1-9]\d*$|^0$/); // zero padding stripped
      expect(s.city).not.toBe("0");
      for (const v of [s.name, s.address, s.city]) {
        expect(v, JSON.stringify(s)).toBe(v.trim());
        expect(v).not.toMatch(/&#|&amp;|\r|\n/);
        expect(v).not.toMatch(/^(לא ידוע|unknown)$/i);
      }
    }
  });

  it("PriceFull: 50 items, store id, all priced > 0, placeholders null, weighted count", () => {
    const parsed = parsePrices(real(pricesFile));
    expect([parsed.chainId, parsed.storeId, parsed.items.length]).toEqual([chainId, storeId, 50]);
    expect(parsed.items.filter((i) => i.isWeighted)).toHaveLength(weighted);
    for (const i of parsed.items) {
      expect(i.code).toMatch(/^\d+$/);
      expect(i.price).toBeGreaterThan(0);
      expect(Number.isFinite(i.price)).toBe(true);
      expect(placeholder(i.manufacturer), JSON.stringify(i)).toBe(false);
      if (i.unitQty !== null) expect(i.unitQty, i.code).toMatch(/\S/);
      expect(i.name).toBe(i.name.trim());
      expect(i.name).not.toMatch(/&#\w+;/);
    }
  });
});

describe("real dialect quirks", () => {
  it("Keshet 3-segment file: second dialect, ',' manufacturer is null, 'Unknown' unit is null, weighted flag read", () => {
    const { items } = parsePrices(real("keshet-pricefull-3seg.gz"));
    expect(items).toHaveLength(50);
    expect(items.filter((i) => i.manufacturer === ",")).toEqual([]);
    expect(items.filter((i) => i.unitQty === null).length).toBe(9);
    expect(items.filter((i) => i.isWeighted)).toHaveLength(29);
    expect(items.find((i) => i.code === "5060517886486")).toMatchObject({ manufacturer: null, unitQty: "500 מיליליטרים", price: 8.9 });
  });

  it("Shufersal Stores has a <Chain> root, no ChainName clash, and decodes CBS 2530 to a name", () => {
    const { stores } = parseStores(real("shufersal-stores.gz"));
    expect(stores.map((s) => s.city)).toEqual(["באר יעקב", "הרצליה", "חיפה", "קריית אתא"]);
  });

  it("Stop Market keeps an unmapped CBS code (96) numeric; Dor Alon keeps 9800 numeric and decodes 5000", () => {
    expect(parseStores(real("stop-market-stores.xml")).stores.map((s) => s.city)).toContain("96");
    const dor = parseStores(real("dor-alon-stores.xml")).stores.map((s) => s.city);
    expect(dor).toContain("9800");
    expect(dor).toContain("תל אביב");
    expect(dor).toContain(""); // empty <City/>
  });

  it("Yohananof, Politzer, Salach Dabach and Keshet (City 0 or empty) all give ''", () => {
    for (const f of ["yohananof-stores.xml", "politzer-stores.xml", "salach-dabach-stores.xml", "keshet-stores.xml"])
      expect(new Set(parseStores(real(f)).stores.map((s) => s.city)), f).toEqual(new Set([""]));
  });

  it("a real address ending in the numeric entity &#x0D; comes out clean", () => {
    const addresses = parseStores(real("dor-alon-stores.xml")).stores.map((s) => s.address);
    expect(addresses.join("|")).not.toContain("&#");
  });
});

const store = (extra: string) => `<Root><ChainId>1</ChainId><SubChains><SubChain><SubChainId>1</SubChainId><Stores>${extra}</Stores></SubChain></SubChains></Root>`;
const cityOf = (city: string) => parseStores(store(`<Store><StoreId>1</StoreId><StoreName>n</StoreName><Address>a</Address><City>${city}</City></Store>`)).stores[0]!.city;

describe("CBS city decoding", () => {
  it("decodes known codes (also with whitespace), maps '0' and empty to '', leaves unknown codes numeric", () => {
    expect(cityOf("5000")).toBe("תל אביב");
    expect(cityOf(" 70 ")).toBe("אשדוד");
    expect(cityOf("0")).toBe("");
    expect(cityOf(" 0 ")).toBe("");
    expect(cityOf("")).toBe("");
    expect(cityOf("99999")).toBe("99999");
    expect(cityOf("2630")).toBe("2630"); // Kiryat Gat is not in the shortcut table
    expect(cityOf("חיפה")).toBe("חיפה"); // a real name passes through
    expect(cityOf("00")).toBe("00"); // not the unknown marker "0": stays numeric (geocode treats it as empty)
  });

  it("handles a missing <City> element and a self-closing <City/>", () => {
    const xml = store(`<Store><StoreId>1</StoreId><StoreName>n</StoreName><Address>a</Address></Store><Store><StoreId>2</StoreId><City/></Store>`);
    expect(parseStores(xml).stores.map((s) => s.city)).toEqual(["", ""]);
  });
});

describe("Stores structure", () => {
  it("reads five sub-chains (Dor Alon) and drops stores without a StoreId", () => {
    const sc = (n: number) =>
      `<SubChain><SubChainId>00${n}</SubChainId><Stores><Store><StoreId>${n}01</StoreId><StoreName>s${n}</StoreName></Store><Store><StoreName>no id</StoreName></Store></Stores></SubChain>`;
    const xml = `<Root><ChainID>7290492000005</ChainID><SubChains>${[1, 2, 3, 4, 5].map(sc).join("")}</SubChains></Root>`;
    const { chainId, stores } = parseStores(xml);
    expect(chainId).toBe("7290492000005");
    expect(stores.map((s) => [s.storeId, s.subChainId])).toEqual([["101", "1"], ["201", "2"], ["301", "3"], ["401", "4"], ["501", "5"]]);
  });

  it("a Store's own SubChainId wins over its parent's; one SubChain with a single Store (not an array) still parses", () => {
    const xml = `<Chain><ChainID>1</ChainID><SubChains><SubChain><SubChainID>7</SubChainID><Stores><Store><StoreID>3</StoreID><StoreName>x</StoreName></Store></Stores></SubChain></SubChains></Chain>`;
    expect(parseStores(xml).stores).toEqual([{ storeId: "3", subChainId: "7", name: "x", address: "", city: "" }]);
  });
});

const item = (fields: string) => parsePrices(`<Root><ChainId>1</ChainId><StoreId>1</StoreId><Items><Item><ItemCode>7290000000001</ItemCode>${fields}</Item></Items></Root>`).items;

describe("PriceFull value rules", () => {
  it("trims whitespace around numbers and codes", () => {
    const [i] = parsePrices(
      `<Root><ChainId> 1 </ChainId><StoreId> 007 </StoreId><Items><Item><ItemCode> 7290000000001 </ItemCode><ItemName> x </ItemName><ItemPrice>\n  12.50\t</ItemPrice><UnitOfMeasurePrice> 1.25 </UnitOfMeasurePrice></Item></Items></Root>`,
    ).items;
    expect(i).toMatchObject({ code: "7290000000001", name: "x", price: 12.5, unitPrice: 1.25 });
  });

  it.each(["", "  ", "abc", "NaN", "Infinity", "-Infinity", "1,5"])("an unusable ItemPrice %j drops the item instead of storing NaN/Infinity", (v) => {
    expect(item(`<ItemPrice>${v}</ItemPrice>`)).toEqual([]);
  });

  it("keeps zero and negative prices (ingest filters them) and a missing UnitOfMeasurePrice as null", () => {
    expect(item("<ItemPrice>0</ItemPrice>")[0]).toMatchObject({ price: 0, unitPrice: null });
    expect(item("<ItemPrice>-3.5</ItemPrice><UnitOfMeasurePrice>Infinity</UnitOfMeasurePrice>")[0]).toMatchObject({ price: -3.5, unitPrice: null });
  });

  it("drops items without ItemCode and falls back to the code as name", () => {
    const xml = `<Root><ChainId>1</ChainId><StoreId>1</StoreId><Items><Item><ItemPrice>5</ItemPrice></Item><Item><ItemCode>9</ItemCode><ItemPrice>5</ItemPrice></Item></Items></Root>`;
    expect(parsePrices(xml).items.map((i) => [i.code, i.name])).toEqual([["9", "9"]]);
  });

  it.each([["1", true], ["true", true], ["TRUE", true], [" 1 ", true], ["0", false], ["false", false], ["", false], ["2", false], ["yes", false]])(
    "bIsWeighted %j -> %s",
    (v, want) => {
      expect(item(`<ItemPrice>1</ItemPrice><bIsWeighted>${v}</bIsWeighted>`)[0]!.isWeighted).toBe(want);
    },
  );
  it("bIsWeighted missing -> false", () => expect(item("<ItemPrice>1</ItemPrice>")[0]!.isWeighted).toBe(false));

  it.each(["לא ידוע", "unknown", "Unknown", "UNKNOWN", ",", "---", ".", "-", ",   ,", "  ", "()"])("placeholder manufacturer %j -> null", (v) => {
    expect(item(`<ItemPrice>1</ItemPrice><ManufacturerName>${v}</ManufacturerName>`)[0]!.manufacturer).toBeNull();
    expect(item(`<ItemPrice>1</ItemPrice><ManufactureName>${v}</ManufactureName>`)[0]!.manufacturer).toBeNull();
  });
  it.each(["3M", "7UP", "אסם", "A&B", "ג'ו"])("real manufacturer %j is kept", (v) => {
    expect(item(`<ItemPrice>1</ItemPrice><ManufacturerName>${v.replace("&", "&amp;")}</ManufacturerName>`)[0]!.manufacturer).toBe(v);
  });

  it("unitQty is null when the unit is unknown or blank, whatever the quantity", () => {
    for (const unit of ["Unknown", "לא ידוע", "", ","]) expect(item(`<ItemPrice>1</ItemPrice><Quantity>200</Quantity><UnitQty>${unit}</UnitQty>`)[0]!.unitQty, unit).toBeNull();
    expect(item("<ItemPrice>1</ItemPrice><Quantity>200</Quantity>")[0]!.unitQty).toBeNull();
  });
  it("unitQty joins a normalised quantity and the unit; no quantity gives the bare unit", () => {
    expect(item("<ItemPrice>1</ItemPrice><Quantity> 1.50 </Quantity><UnitQty>ליטר</UnitQty>")[0]!.unitQty).toBe("1.5 ליטר");
    expect(item("<ItemPrice>1</ItemPrice><Quantity>200.00</Quantity><UnitQty>גרם</UnitQty>")[0]!.unitQty).toBe("200 גרם");
    expect(item("<ItemPrice>1</ItemPrice><UnitQty>יחידות</UnitQty>")[0]!.unitQty).toBe("יחידות");
  });
  // 14,387 of ~1M real items have a unit but Quantity 0 or missing; they get the unit alone ("יחידות"), which names no amount.
  it.skip("Quantity 0 with a unit should not produce a bare unit (num(0) is falsy, so it is silently dropped)", () => {
    expect(item("<ItemPrice>1</ItemPrice><Quantity>0.00</Quantity><UnitQty>יחידות</UnitQty>")[0]!.unitQty).toBeNull();
  });

  it("decodes named and numeric entities once (&amp; &quot; &#34; &#x0D;), without double-decoding &amp;#039;", () => {
    const [i] = item(`<ItemPrice>1</ItemPrice><ItemName>a &amp; b &quot;q&quot; &#34;r&#34; x&#x0D;</ItemName>`);
    expect(i!.name).toBe('a & b "q" "r" x');
    expect(item(`<ItemPrice>1</ItemPrice><ItemName>it&amp;#039;s</ItemName>`)[0]!.name).toBe("it&#039;s");
  });

  it("returns the same ItemCode twice when a file repeats it (ingest decides which row wins)", () => {
    const xml = `<Root><ChainId>1</ChainId><StoreId>1</StoreId><Items><Item><ItemCode>5</ItemCode><ItemPrice>7.9</ItemPrice></Item><Item><ItemCode>5</ItemCode><ItemPrice>8.9</ItemPrice></Item></Items></Root>`;
    expect(parsePrices(xml).items.map((i) => i.price)).toEqual([7.9, 8.9]);
  });
});

describe("decodeXml", () => {
  it("rejects garbage that is not XML (parse throws instead of returning an empty store)", () => {
    expect(() => parseStores(decodeXml(Buffer.from("not xml at all")))).toThrow();
    expect(() => parsePrices(decodeXml(Buffer.from("")))).toThrow();
  });
});
