// QA: product-key scoping (global GTIN vs `${chainId}:${itemCode}`) through ingest and the barcode search.
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import * as ing from "#/ingest/ingest.ts";
import { isGtin } from "#/ingest/parse.ts";
import { loadConfig } from "#/services/config.ts";

let app: ReturnType<typeof createApp>;
let cookie: string;
let deps: ReturnType<typeof buildDeps>;
let sqlite: Database;

const OSHER = "7290103152017";
const RAMI = "7290058140886";
const VICTORY = ["7290696200003", "7290058103393"];
const withCheck = (body: string) => {
  const sum = [...body].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
};
const GTIN = withCheck("729000100001"); // EAN-13
const GTIN_B = withCheck("729000100002");
const UPC11 = "10900302814"; // 11 digits, valid when a leading 0 is restored
// Same 8-digit prefix as the Rami Levy ChainId (72900581), so a prefix search for it must find this GTIN and not the scoped items.
const NEAR_CHAIN = withCheck("729005810001");

const storesXml = (chain: string, ids: string[]) =>
  `<Root><ChainId>${chain}</ChainId><Stores>${ids.map((i) => `<Store><StoreId>${i}</StoreId><StoreName>s${i}</StoreName><Address>a</Address><City>c</City></Store>`).join("")}</Stores></Root>`;
const pricesXml = (chain: string, store: string, items: [code: string, price: number, name?: string][]) =>
  `<Root><ChainId>${chain}</ChainId><StoreId>${store}</StoreId><Items>${items
    .map(([c, p, n]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${n ?? `item ${c}`}</ItemName><ItemPrice>${p}</ItemPrice></Item>`)
    .join("")}</Items></Root>`;
const count = (sql: string, ...args: unknown[]) => (sqlite.prepare(sql).get(...args) as { n: number }).n;
const snapshot = () => ({
  products: sqlite.prepare("SELECT code, item_code, name, manufacturer, unit_qty, is_weighted FROM products ORDER BY code").all(),
  prices: sqlite.prepare("SELECT store_id, code, price FROM prices ORDER BY store_id, code").all(),
  stores: count("SELECT count(*) AS n FROM stores"),
  fts: count("SELECT count(*) AS n FROM products_fts"),
});
const search = async (q: string, extra = "") => {
  const res = await app.request(`/api/products/search?q=${encodeURIComponent(q)}${extra}`, { headers: { cookie } });
  expect(res.status, q).toBe(200);
  return (await res.json()) as { code: string; name: string; storeCount: number; minPrice: number }[];
};

beforeAll(async () => {
  deps = buildDeps(loadConfig());
  app = createApp(deps);
  sqlite = deps.db.$client;
  ing.ingestStores(deps, "osher-ad", storesXml(OSHER, ["1", "2"]));
  ing.ingestStores(deps, "rami-levy", storesXml(RAMI, ["1", "2"]));
  ing.ingestStores(deps, "victory", storesXml(VICTORY[0]!, ["1"]));
  ing.ingestStores(deps, "victory", storesXml(VICTORY[1]!, ["2"]));
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "scope@ingest.test", password: "password1234", name: "Shay" }),
  });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});

describe("product keys", () => {
  it("a GTIN is global across chains, an internal code is scoped, and item_code always holds the raw code", () => {
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "1", [[GTIN, 10, "cola"], ["1022788", 5, "גבינה אושר"], ["12", 3, "בננה אושר"]]));
    ing.ingestPrices(deps, "rami-levy", pricesXml(RAMI, "1", [[GTIN, 9, "cola rami"], ["1022788", 6, "גבינה רמי"], ["12", 4, "בננה רמי"]]));
    expect(sqlite.prepare("SELECT code, item_code, name FROM products WHERE item_code IN (?, '1022788', '12') ORDER BY code").all(GTIN)).toEqual(
      [
        { code: GTIN, item_code: GTIN, name: "cola" }, // first chain names it
        { code: `${OSHER}:1022788`, item_code: "1022788", name: "גבינה אושר" },
        { code: `${RAMI}:1022788`, item_code: "1022788", name: "גבינה רמי" },
        { code: `${OSHER}:12`, item_code: "12", name: "בננה אושר" },
        { code: `${RAMI}:12`, item_code: "12", name: "בננה רמי" },
      ].sort((a, b) => (a.code < b.code ? -1 : 1)),
    );
    expect(count("SELECT count(*) AS n FROM prices WHERE code = ?", GTIN)).toBe(2);
    expect(count("SELECT count(*) AS n FROM prices WHERE code = ?", `${RAMI}:1022788`)).toBe(1);
    // no raw scoped code leaks into the global namespace
    expect(count("SELECT count(*) AS n FROM products WHERE code = '1022788' OR code = '12'")).toBe(0);
  });

  it("a scoped code re-ingested by a second store of the same chain shares one product; a second chain stays separate", () => {
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "2", [["1022788", 7, "גבינה אושר 2"]]));
    expect(count("SELECT count(*) AS n FROM products WHERE item_code = '1022788'")).toBe(2);
    expect(sqlite.prepare("SELECT name FROM products WHERE code = ?").get(`${OSHER}:1022788`)).toEqual({ name: "גבינה אושר" }); // first file names it
    expect(count("SELECT count(*) AS n FROM prices WHERE code = ?", `${OSHER}:1022788`)).toBe(2);
  });

  it("an 11-digit UPC (leading 0 dropped) is global; a 11-digit code with a bad check digit is scoped", () => {
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "1", [[GTIN, 10, "cola"], [UPC11, 4, "upc"], ["10900302815", 4, "bad upc"], ["1022788", 5, "x"]]));
    expect(isGtin(UPC11)).toBe(true);
    expect(count("SELECT count(*) AS n FROM products WHERE code = ?", UPC11)).toBe(1);
    expect(count("SELECT count(*) AS n FROM products WHERE code = ?", `${OSHER}:10900302815`)).toBe(1);
    expect(count("SELECT count(*) AS n FROM products WHERE code = '10900302815'")).toBe(0);
  });

  it("a chain with two ChainIds scopes under its first id whichever id the file carries", () => {
    ing.ingestPrices(deps, "victory", pricesXml(VICTORY[0]!, "1", [["555", 1, "v1"]]));
    ing.ingestPrices(deps, "victory", pricesXml(VICTORY[1]!, "2", [["555", 2, "v2"]]));
    expect(sqlite.prepare("SELECT code, item_code FROM products WHERE item_code = '555'").all()).toEqual([{ code: `${VICTORY[0]}:555`, item_code: "555" }]);
    expect(count("SELECT count(*) AS n FROM prices WHERE code = ?", `${VICTORY[0]}:555`)).toBe(2);
    expect(count("SELECT count(*) AS n FROM stores WHERE chain_id = ?", VICTORY[0])).toBe(2); // both stores sit under ids[0]
  });

  it("re-ingesting the same Stores and PriceFull files leaves every table byte-identical", () => {
    const files: [string, string, string, [string, number, string?][]][] = [
      ["osher-ad", OSHER, "1", [[GTIN, 10, "cola"], ["1022788", 5, "גבינה אושר"], ["12", 3, "בננה אושר"], [UPC11, 4, "upc"]]],
      ["rami-levy", RAMI, "1", [[GTIN, 9, "cola rami"], ["1022788", 6, "גבינה רמי"], ["12", 4, "בננה רמי"]]],
    ];
    for (const [k, c, s, items] of files) ing.ingestPrices(deps, k, pricesXml(c, s, items));
    const before = snapshot();
    for (let i = 0; i < 2; i++) {
      ing.ingestStores(deps, "osher-ad", storesXml(OSHER, ["1", "2"]));
      for (const [k, c, s, items] of files) expect(ing.ingestPrices(deps, k, pricesXml(c, s, items))).toBe(items.length);
    }
    expect(snapshot()).toEqual(before);
  });
});

describe("duplicate ItemCodes in one PriceFull", () => {
  it("global GTIN: one row, the last price wins, and the return value counts distinct rows", () => {
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, ["20"]));
    const n = ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "20", [[GTIN_B, 7.9], [GTIN_B, 8.9], ["77", 1], ["77", 2], ["77", 3]]));
    expect(n).toBe(2);
    expect(sqlite.prepare("SELECT code, price FROM prices WHERE store_id = ? ORDER BY code").all(`${OSHER}-20`)).toEqual([
      { code: GTIN_B, price: 8.9 },
      { code: `${OSHER}:77`, price: 3 },
    ]);
  });

  it("the same GTIN as 11-digit and 12-digit spellings are two products (no leading-zero merging)", () => {
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "20", [[UPC11, 1], [`0${UPC11}`, 2]]));
    expect(sqlite.prepare("SELECT code, price FROM prices WHERE store_id = ? ORDER BY code").all(`${OSHER}-20`)).toEqual([
      { code: `0${UPC11}`, price: 2 },
      { code: UPC11, price: 1 },
    ]);
  });

  it("a later duplicate priced 0 is skipped, so the earlier valid price survives", () => {
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "20", [[GTIN_B, 5], [GTIN_B, 0]]));
    expect(sqlite.prepare("SELECT price FROM prices WHERE store_id = ? AND code = ?").get(`${OSHER}-20`, GTIN_B)).toEqual({ price: 5 });
  });
});

describe("GET /products/search by barcode", () => {
  beforeAll(() => {
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, ["30"]));
    ing.ingestStores(deps, "rami-levy", storesXml(RAMI, ["30"]));
    // Names are the codes' own words so FTS cannot be what finds them.
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "30", [[NEAR_CHAIN, 10, "alpha"], ["1022788", 5, "beta"]]));
    ing.ingestPrices(deps, "rami-levy", pricesXml(RAMI, "30", [[NEAR_CHAIN, 8, "alpha"], ["102278899", 3, "gamma"], ["10227889", 3, "delta"]]));
  });

  it("an exact GTIN returns that product first with storeCount and minPrice", async () => {
    const rows = await search(NEAR_CHAIN);
    expect(rows[0]).toMatchObject({ code: NEAR_CHAIN, storeCount: 2, minPrice: 8 });
  });

  it("a GTIN prefix of 8+ digits lists the GTINs under it, exact match first, never a scoped item", async () => {
    const prefix = NEAR_CHAIN.slice(0, 10);
    const rows = await search(prefix);
    expect(rows.map((r) => r.code)).toEqual([NEAR_CHAIN]);
    expect(rows.every((r) => !r.code.includes(":"))).toBe(true);
  });

  it("searching a ChainId prefix never lists that chain's scoped items, but still lists GTINs that share the digits", async () => {
    const scoped = (await search("beta")).concat(await search("gamma"), await search("delta"));
    expect(scoped.every((r) => r.code.startsWith(`${OSHER}:`) || r.code.startsWith(`${RAMI}:`))).toBe(true);
    expect(scoped.length).toBeGreaterThan(0);
    for (const q of [RAMI, OSHER, RAMI.slice(0, 8), OSHER.slice(0, 9)]) {
      const rows = await search(q);
      expect(rows.filter((r) => r.code.includes(":")), q).toEqual([]);
    }
    expect((await search(RAMI.slice(0, 8))).map((r) => r.code)).toContain(NEAR_CHAIN);
    expect(await search(OSHER)).toEqual([]);
  });

  it("an 8+-digit query equal to an internal code's raw digits does not surface the scoped product (only by name)", async () => {
    expect((await search("10227889")).map((r) => r.code)).not.toContain(`${RAMI}:10227889`);
    expect((await search("102278899")).map((r) => r.code)).not.toContain(`${RAMI}:102278899`);
  });

  it("the 11-digit UPC is found exactly and by prefix", async () => {
    expect((await search(UPC11)).map((r) => r.code)).toEqual([UPC11]);
    expect((await search(UPC11.slice(0, 8))).map((r) => r.code)).toContain(UPC11);
  });

  it("an unknown barcode returns []; a product without prices is not listed; limit applies to prefix hits", async () => {
    expect(await search("00000000")).toEqual([]);
    sqlite.prepare("INSERT INTO products (code, name) VALUES ('9999999999994', 'no prices')").run();
    expect(await search("9999999999994")).toEqual([]);
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "30", [[NEAR_CHAIN, 10, "alpha"], [withCheck("729005810002"), 1], [withCheck("729005810003"), 1]]));
    expect(await search(NEAR_CHAIN.slice(0, 9))).toHaveLength(3);
    expect(await search(NEAR_CHAIN.slice(0, 9), "&limit=2")).toHaveLength(2);
  });

  it("7 digits or fewer is a name search, not a barcode lookup, and finds nothing by code", async () => {
    expect(await search("1022788")).toEqual([]); // "beta" has the raw code only in item_code
  });
});
