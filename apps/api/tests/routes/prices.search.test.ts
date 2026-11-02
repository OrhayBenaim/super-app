import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const SHUFERSAL = "7290027600007";
const RAMI = "7290058140886";
const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);

type Item = [code: string, name: string, price: number, opts?: { weighted?: boolean; unit?: string }];
const storesXml = (chain: string, ids: number[]) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores>${ids
    .map((id) => `<Store><StoreID>${id}</StoreID><StoreName>סניף ${id}</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store>`)
    .join("")}</Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: string, store: number, items: Item[]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>${store}</StoreID><Items>${items
    .map(([code, name, price, o]) => `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${o?.unit ?? "קילוגרם"}</UnitQty><Quantity>1.00</Quantity><bIsWeighted>${o?.weighted === false ? 0 : 1}</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

const milk = gtin("729000006631");
const chips = gtin("729000006632");
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  const deps = buildDeps(loadConfig());
  app = createApp(deps);
  ingestStores(deps, "osher-ad", storesXml(OSHER, [1, 2, 3, 4]));
  ingestStores(deps, "shufersal", storesXml(SHUFERSAL, [1]));
  ingestStores(deps, "rami-levy", storesXml(RAMI, [1]));
  // Osher Ad store n carries every product listed with a store count >= n; prices drop by one per store.
  const packed = { weighted: false, unit: "יחידה" };
  const products: [code: string, name: string, stores: number, price: number][] = [
    [milk, "חלב 3% 1 ליטר", 2, 6],
    [gtin("729000006641"), "חלב תנובה", 1, 7],
    [gtin("729000006642"), "שוקולד חלב", 3, 8],
    [gtin("729000006643"), "שוקולד חלב תנובה", 2, 9],
    [gtin("729000006644"), "חלבה", 4, 10],
    [gtin("729000006645"), "חלבה תנובה", 3, 11],
    [gtin("729000006646"), "קוטג תנובה", 4, 5],
    [gtin("729000006651"), "לחם אחיד", 3, 12],
    [gtin("729000006652"), "לחם בטעמים אגדת לחם", 1, 13],
    [chips, "בננה ציפס", 2, 14],
    ...["חציל קלוי", "חציל במיונז", "חציל בטחינה", "חציל פיקנטי"].map((name, i): [string, string, number, number] => [gtin(`72900000667${i}`), name, 4, 15]),
    ...["גזר מגורד", "גזר גמדי", "גזר בתבלינים", "גזר חמוץ"].map((name, i): [string, string, number, number] => [gtin(`72900000668${i}`), name, 4, 16]),
    [gtin("729000006691"), "Milk", 1, 17],
    [gtin("729000006692"), "Milk chocolate", 2, 18],
  ];
  for (let store = 1; store <= 4; store++) {
    const items = products.filter((p) => p[2] >= store).map<Item>(([code, name, , price]) => [code, name, price - (store - 1), packed]);
    if (store === 1) items.push(["111", "בננות", 6]); // an ingest replaces the store's prices, so banana joins store 1's file
    ingestPrices(deps, "osher-ad", pricesXml(OSHER, store, items));
  }
  // Banana is one Produce group over three chain-local codes, each priced at a single store (fewer than the chips' two).
  // Eggplant too, against four salads priced at every Osher Ad store. Carrot is eight members none named just "גזר".
  const carrots = ["גזר במשקל", "גזר טרי", "גזר ישראלי", "גזר מובחר"].map((name, i): Item => [`2${i}`, name, 4]);
  ingestPrices(deps, "shufersal", pricesXml(SHUFERSAL, 1, [["11", "בננה", 7], ["12", "חציל", 5], ...carrots]));
  ingestPrices(deps, "rami-levy", pricesXml(RAMI, 1, [["5", "בננה במשקל", 6.5], ["6", "חציל", 5], ...carrots]));
});

type Found = { code: string; name: string; manufacturer: string | null; unitQty: string | null; storeCount: number; minPrice: number };
const search = async (q: string) => (await (await app.request(`/api/products/search?q=${encodeURIComponent(q)}`)).json()) as Found[];
const names = async (q: string) => (await search(q)).map((r) => r.name);

describe("product search ranking", () => {
  it("puts a product named after the word first, then whole-word matches, then prefix-only matches, whatever the store count", async () => {
    expect(await names("חלב")).toEqual(["חלב 3% 1 ליטר", "חלב תנובה", "שוקולד חלב", "שוקולד חלב תנובה", "חלבה", "חלבה תנובה"]);
  });

  it("ranks by store count within a tier, so a repeated word does not beat a popular product", async () => {
    expect(await names("לחם")).toEqual(["לחם אחיד", "לחם בטעמים אגדת לחם"]);
  });

  it("puts the product named exactly the word first, even a Produce group whose members are each priced in few stores", async () => {
    const rows = (await (await app.request(`/api/products/search?q=${encodeURIComponent("חציל")}&limit=1`)).json()) as Found[];
    expect(rows.map((r) => [r.name, r.storeCount])).toEqual([["חציל", 2]]);
  });

  it("ranks a Produce group shown as the word first, and as one row however many members match", async () => {
    const rows = (await (await app.request(`/api/products/search?q=${encodeURIComponent("גזר")}&limit=2`)).json()) as Found[];
    expect(rows.map((r) => [r.name, r.storeCount])).toEqual([["גזר", 2], [expect.stringMatching(/^גזר /), 4]]);
  });

  it("matches the exact name regardless of ASCII case, as the FTS index does", async () => {
    expect(await names("milk")).toEqual(["Milk", "Milk chocolate"]);
  });

  it("requires every token to match and orders by the first token's tier", async () => {
    expect(await names("חלב תנובה")).toEqual(["חלב תנובה", "שוקולד חלב תנובה", "חלבה תנובה"]);
  });

  it("ranks a Produce group by its distinct stores across chains, above a product priced in more stores than any member", async () => {
    const rows = await search("בננה");
    expect(rows.map((r) => [r.name, r.storeCount])).toEqual([["בננה", 3], ["בננה ציפס", 2]]);
  });

  it("returns only code, name, manufacturer, unitQty, storeCount and minPrice, with the cheapest price", async () => {
    const rows = await search("חלב");
    for (const r of [...rows, ...(await search("בננה"))])
      expect(Object.keys(r).sort()).toEqual(["code", "manufacturer", "minPrice", "name", "storeCount", "unitQty"]);
    expect(rows[0]).toMatchObject({ code: milk, storeCount: 2, minPrice: 5 });
  });

  it("leaves barcode and LIKE searches as before", async () => {
    expect(await search(milk)).toEqual([{ code: milk, name: "חלב 3% 1 ליטר", manufacturer: null, unitQty: "1 יחידה", storeCount: 2, minPrice: 5 }]);
    expect(await names("חלב 3%")).toEqual(["חלב 3% 1 ליטר"]);
  });
});
