import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const SHUFERSAL = "7290027600007";
const RAMI = "7290058140886";
const here = { lat: 32.0853, lng: 34.7818 };
const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
let n = 0;
const next = () => gtin(`7290001${String(++n).padStart(5, "0")}`);

// [code, name, price, opts]: qty + unit read "500 גרם"; w = sold by the kilo (bIsWeighted 1).
type Opts = { w?: boolean; qty?: number; unit?: string };
type Item = [code: string, name: string, price: number, opts?: Opts];
const storesXml = (chain: string, store = "1", name = "סניף") =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>${store}</StoreID><StoreName>${name}</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: string, items: Item[], store = "1") =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>${store}</StoreID><Items>${items
    .map(([code, name, price, o]) => `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${o?.unit ?? "יחידות"}</UnitQty><Quantity>${o?.qty ?? 1}</Quantity><bIsWeighted>${o?.w ? 1 : 0}</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

const g500: Opts = { qty: 500, unit: "גרם" };
const kg: Opts = { qty: 1, unit: "קילוגרם" };
const g250: Opts = { qty: 250, unit: "גרם" };
const litre: Opts = { qty: 1, unit: "ליטר" };
const W: Opts = { w: true, qty: 1, unit: "קילוגרם" };

const sugatDek = next(), sugatThick = next(), miaCoarse = next(), miaDek = next();
const tnuvaCottage = next(), milk3 = next(), milk1 = next(), milkAlmond = next(), milkSoy = next(), milkChoc = next(), condensed = next();
const eggOsherL = next(), eggOsherM = next(), eggShufM = next(), eggRamiL = next(), eggOsher18 = next(), eggShuf18 = next(), egg30 = next();
const riceSugat = next(), riceMia = next(), riceRami = next(); // two 500 g and a 1 kg
const nobody = "7290000000000";

let deps: ReturnType<typeof buildDeps>;
let app: ReturnType<typeof createApp>;
let cookie: string;

beforeAll(async () => {
  deps = buildDeps(loadConfig());
  app = createApp(deps);
  const load = (key: string, chain: string, items: Item[]) => {
    ingestStores(deps, key, storesXml(chain));
    ingestPrices(deps, key, pricesXml(chain, items));
  };
  load("osher-ad", OSHER, [
    // bulgur: 500 g at 7.40/kg, 1 kg at 6.80, a cut-off name read as 1 kg at 7.20, and two dishes that are not bulgur
    [sugatDek, "בורגול דק סוגת", 3.7, g500],
    [sugatThick, "בורגול עבה סוגת", 6.8, kg],
    ["b1", "בורגול עבה 1קג רמי ל", 7.2],
    [miaDek, "בורגול דק מיה", 3.9, g500],
    ["b2", "בורגול עם גרגירי חומוס", 12, { qty: 400, unit: "גרם" }],
    ["b3", "קובה בורגול", 15, { qty: 300, unit: "גרם" }],
    // cottage cheese, a glued name, a flavour and a vegan substitute
    [tnuvaCottage, "קוטג תנובה 250 גרם", 5, g250],
    ["c1", "גבינת קוטג%5מהדרין250גר", 4.5],
    ["c2", "קוטג עם זיתים 250 גרם", 6, g250],
    ["c3", "קוטג' טבעוני 250 גרם", 8, g250],
    // milk, its look-alikes, and the sweetened condensed milk sold by weight
    [milk3, "חלב 3% 1 ליטר", 6, litre],
    [milk1, "חלב 1% 1 ליטר", 6.4, litre],
    [milkAlmond, "חלב שקדים 1 ליטר", 12, litre],
    [milkSoy, "חלב סויה 1 ליטר", 10, litre],
    [milkChoc, "שוקולד חלב 100 גרם", 7, { qty: 100, unit: "גרם" }],
    [condensed, "חלב מרוכז ממותק 397 גרם", 8, { qty: 397, unit: "גרם" }],
    // eggs
    [eggOsherL, "ביצים L 12 יח", 14],
    [eggOsherM, "ביצים M 12 יח", 13.5],
    [eggOsher18, "ביצים L 18 יח", 20],
    [egg30, "ביצים 30 יח", 40],
    // produce, sold by the kilo
    ["111", "בננות", 6, W],
    ["112", "בננה מובחרת", 5, W],
    ["121", "גזר תפזורת", 3, W],
    ["122", "גזר ארוז", 4, W],
    ["131", "אבטיח שלם", 20, { w: true }], // weighted, but counted in יחידות
    [riceSugat, "אורז בסמטי סוגת", 6, g500],
    [riceMia, "אורז בסמטי מיה", 6.5, g500],
    // stemmed to "סידר": the index keeps "יי"
    ["s1", "סיידר תפוחים 1 ליטר", 9, litre],
  ]);
  load("shufersal", SHUFERSAL, [
    [miaCoarse, "בורגול גס מיה", 3.5, g500],
    [tnuvaCottage, "קוטג תנובה 250 גרם", 5.2, g250],
    ["c4", "קוטג 5% 500 גרם", 9, g500],
    [milk3, "חלב 3% 1 ליטר", 5.5, litre],
    [eggShufM, "ביצים M 12 יח", 13],
    [eggShuf18, "ביצים M 18 יח", 19],
    ["11", "בננה", 7, W],
    ["21", "גזר", 2.5, W],
    ["22", "גזר ארוז", 4.5, W],
    ["s2", "סיידר 1 ליטר", 8, litre],
  ]);
  load("rami-levy", RAMI, [
    ["c5", "קוטג עם זיתים 250 גרם", 6.5, g250],
    [milk1, "חלב 1% 1 ליטר", 6.2, litre],
    [eggRamiL, "ביצים L 12 יח", 15],
    ["5", "בננה במשקל", 6.5, W],
    [riceRami, "אורז בסמטי רמי לוי", 11, kg],
  ]);
  const setPos = deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE id = ?");
  setPos.run(here.lat + 0.0045, here.lng, `${OSHER}-1`);
  setPos.run(here.lat + 0.009, here.lng, `${SHUFERSAL}-1`);
  setPos.run(here.lat + 0.0135, here.lng, `${RAMI}-1`);

  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "groups@prices.test", password: "password1234", name: "Gal" }),
  });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});

type Row = { kind: "group" | "product"; ref?: string; code?: string; name: string; measure: string | null; size: number | null; productCount?: number; storeCount: number; minPrice: number; refinements?: string[]; unitQty?: string | null };
type GroupItem = { ref: string; code: string; name: string; size: number; unitPrice?: number; price: number; quantity: number; lineTotal: number };
type Store = { chainName: string; storeName: string; total: number; matched: number; missingCodes: string[]; items: ({ code: string; price: number; quantity: number; lineTotal: number } | GroupItem)[] };
const search = async (q: string) => (await (await app.request(`/api/products/search?q=${encodeURIComponent(q)}`, { headers: { cookie } })).json()) as Row[];
const groups = async (q: string) => (await search(q)).filter((r) => r.kind === "group");
const post = (body: unknown, auth = true) =>
  app.request("/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
/** Compare body items, each at quantity 1. */
const q = (codes: unknown) => (Array.isArray(codes) ? codes.map((code) => ({ code, quantity: 1 })) : codes);
const compare = async (body: { items?: unknown; groups?: { ref: string; quantity?: number }[] }) => {
  const res = await post({ ...here, ...body });
  expect(res.status).toBe(200);
  return (await res.json()) as { stores: Store[]; unmatched: string[] };
};
const store = (r: { stores: Store[] }, chain: string) => r.stores.find((s) => s.chainName === chain)!;
const groupItem = (s: Store) => s.items.find((i): i is GroupItem => "ref" in i)!;

describe("product groups: search", () => {
  it("puts one bulgur group row first, covering every brand and size, with the lowest price per kilo", async () => {
    const rows = await search("בורגול");
    expect(rows[0]).toMatchObject({ kind: "group", ref: "בורגול|kg", name: "בורגול", measure: "kg", productCount: 5, storeCount: 2, minPrice: 6.8 });
    expect(rows.slice(1).every((r) => r.kind === "product")).toBe(true);
    expect(rows.filter((r) => r.kind === "product")).toHaveLength(7); // every bulgur and both dishes stay findable
  });

  it("lists the group's best-matching products in topCodes, at most five, in search order", async () => {
    const rows = await search("בורגול");
    const { topCodes } = rows[0] as Row & { topCodes: string[] };
    const order = rows.filter((r) => r.kind === "product").map((r) => r.code!);
    const at = topCodes.map((c) => order.indexOf(c));
    expect(topCodes).toHaveLength(5);
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("offers refinements shared by two or more products, and no word that only one has", async () => {
    const [bulgur] = await groups("בורגול");
    expect([...bulgur!.refinements!].sort()).toEqual(["דק", "עבה"]);
  });

  it("narrows to a smaller group when more words are typed, as a chip tap does", async () => {
    const [dek] = await groups("בורגול דק");
    expect(dek).toMatchObject({ ref: "בורגול דק|kg", productCount: 2, minPrice: 7.4 });
    expect((await groups("בורגול גס")).length).toBe(0); // one product: not a group
  });

  it("never splits a kilo group by a typed size", async () => {
    expect(await groups("בורגול 500 גרם")).toMatchObject([{ ref: "בורגול|kg", productCount: 5 }]);
  });

  it("ranks products the same with or without punctuation in the query", async () => {
    const names = async (q: string) => (await search(q)).filter((r) => r.kind === "product").map((r) => r.name);
    expect(await names("קוטג'")).toEqual(await names("קוטג"));
  });

  it("keeps dishes out of the bulgur group", async () => {
    const rows = await search("בורגול עם גרגירי חומוס");
    expect(rows.some((r) => r.kind === "group")).toBe(false);
    expect(rows.map((r) => r.name)).toContain("בורגול עם גרגירי חומוס");
    const [bulgur] = await groups("בורגול");
    expect(bulgur!.productCount).toBe(5);
  });

  it("reads sizes from glued, cut-off and unit-quantity names, so each counts in the group's price per kilo", async () => {
    const [cottage] = await groups("קוטג");
    // 4.5 for the glued "250גר" is 18/kg; 5 for 250 g is 20/kg; 9 for 500 g is 18/kg
    expect(cottage).toMatchObject({ ref: "קוטג|kg", measure: "kg", productCount: 3, minPrice: 18 });
    const glued = (await search("קוטג")).find((r) => r.name === "גבינת קוטג%5מהדרין250גר");
    expect(glued).toMatchObject({ name: "גבינת קוטג%5מהדרין250גר", measure: "kg", size: 0.25 });
    const cut = (await search("בורגול עבה")).find((r) => r.name === "בורגול עבה 1קג רמי ל");
    expect(cut).toMatchObject({ measure: "kg", size: 1 });
  });

  it("includes גבינת קוטג in the קוטג group, whichever way it is typed", async () => {
    const [byCheese] = await groups("גבינת קוטג");
    expect(byCheese).toMatchObject({ ref: "קוטג|kg", productCount: 3 });
    expect((await search("קוטג")).filter((r) => r.name === "גבינת קוטג%5מהדרין250גר")).toHaveLength(1);
  });

  it("keeps a flavoured or vegan cottage out of the broad group unless its words are typed", async () => {
    const [cottage] = await groups("קוטג");
    expect(cottage!.productCount).toBe(3);
    expect(await groups("קוטג עם זיתים")).toEqual([]); // one product
    expect(await groups("קוטג' טבעוני")).toEqual([]);
    expect((await search("קוטג' טבעוני")).map((r) => r.name)).toEqual(["קוטג' טבעוני 250 גרם"]);
  });

  it("keeps chocolate milk, plant drinks and condensed milk out of the milk group", async () => {
    const [milk] = await groups("חלב");
    expect(milk).toMatchObject({ ref: "חלב|l", measure: "l", productCount: 2, storeCount: 3, minPrice: 5.5 });
    const names = (await search("חלב")).filter((r) => r.kind === "product").map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(["חלב מרוכז ממותק 397 גרם", "שוקולד חלב 100 גרם", "חלב שקדים 1 ליטר", "חלב סויה 1 ליטר"]));
    expect(await groups("חלב שקדים")).toEqual([]);
  });

  it("shows one egg group per pack count, with the pack price, and none for a pack of one product", async () => {
    const eggs = await groups("ביצים");
    expect(eggs.map((g) => g.ref).sort()).toEqual(["ביצ|unit|12", "ביצ|unit|18"]);
    const dozen = eggs.find((g) => g.ref === "ביצ|unit|12")!;
    expect(dozen).toMatchObject({ measure: "unit", size: 12, productCount: 4, storeCount: 3, minPrice: 13 }); // the pack, not per egg
    expect(eggs.find((g) => g.ref === "ביצ|unit|18")).toMatchObject({ productCount: 2, minPrice: 19 });
    expect((await search("ביצים")).filter((r) => r.name === "ביצים 30 יח")).toHaveLength(1);
  });

  it("offers L and M as refinements inside a pack count", async () => {
    const dozen = (await groups("ביצים")).find((g) => g.ref === "ביצ|unit|12")!;
    expect([...dozen.refinements!].sort()).toEqual(["L", "M"]);
  });

  it("groups produce plurals and spellings, however they are typed", async () => {
    for (const q of ["בננה", "בננות", "בננה מובחרת"]) {
      const [banana] = await groups(q);
      expect(banana, q).toMatchObject({ ref: "בננה|kg", productCount: 4, storeCount: 3, minPrice: 5 });
    }
  });

  it("finds a group whose name has a doubled yod, however it is typed", async () => {
    for (const q of ["סיידר", "סידר"]) expect(await groups(q), q).toMatchObject([{ ref: "סידר|l", name: "סיידר", productCount: 2 }]);
  });

  it("keeps packed produce apart from loose", async () => {
    const [loose] = await groups("גזר");
    expect(loose).toMatchObject({ ref: "גזר|kg", productCount: 2, storeCount: 2, minPrice: 2.5 });
    const [packed] = await groups("גזר ארוז");
    expect(packed).toMatchObject({ ref: "גזר ארוז|kg", productCount: 2, minPrice: 4 });
  });

  it("says how each result is sold: weighted kilos by weight, weighted units and packs by the unit", async () => {
    expect((await groups("בננה"))[0]).toMatchObject({ ref: "בננה|kg", soldBy: "weight" });
    expect((await groups("בורגול"))[0]).toMatchObject({ ref: "בורגול|kg", soldBy: "unit" });
    const product = async (q: string, name: string) => (await search(q)).find((r) => r.name === name);
    expect(await product("בננה", "בננה מובחרת")).toMatchObject({ soldBy: "weight", minPrice: 5 });
    expect(await product("אבטיח", "אבטיח שלם")).toMatchObject({ soldBy: "unit" });
    expect(await product("בורגול", "בורגול דק סוגת")).toMatchObject({ soldBy: "unit" });
  });

  it("leaves barcode search as the exact product, never a group", async () => {
    expect(await search(milk3)).toEqual([
      { kind: "product", code: milk3, name: "חלב 3% 1 ליטר", manufacturer: null, unitQty: "1 ליטר", storeCount: 2, minPrice: 5.5, measure: "l", size: 1, soldBy: "unit" },
    ]);
  });

  it("does not error on punctuation and does not match everything", async () => {
    for (const q of ["%%", "__", "''", '""', "קוטג'%", "בורגול_"]) {
      const res = await app.request(`/api/products/search?q=${encodeURIComponent(q)}`, { headers: { cookie } });
      expect(res.status, q).toBe(200);
      expect(((await res.json()) as Row[]).length, q).toBeLessThan(20);
    }
    expect(await search("%%")).toEqual([]);
  });

  it("401 without a session", async () => {
    expect((await app.request("/api/products/search?q=x")).status).toBe(401);
  });
});

describe("product search at one store (storeId)", () => {
  const at = (q: string, storeId: string, auth = true) =>
    app.request(`/api/products/search?q=${encodeURIComponent(q)}&storeId=${encodeURIComponent(storeId)}`, { headers: auth ? { cookie } : {} });
  const searchAt = async (q: string, storeId: string) => {
    const res = await at(q, storeId);
    expect(res.status).toBe(200);
    return (await res.json()) as Row[];
  };

  it("returns only the products that store prices", async () => {
    const rows = await searchAt("בורגול", `${SHUFERSAL}-1`);
    expect(rows.filter((r) => r.kind === "product").map((r) => r.name)).toEqual(["בורגול גס מיה"]);
  });

  it("gives a product that store's price, not the cheapest anywhere", async () => {
    const milk = (await searchAt("חלב 3%", `${OSHER}-1`)).find((r) => r.code === milk3);
    expect(milk).toMatchObject({ minPrice: 6 }); // 5.5 at Shufersal
    expect(await searchAt(milk3, `${SHUFERSAL}-1`)).toMatchObject([{ code: milk3, minPrice: 5.5 }]);
    expect(await searchAt(milk3, `${RAMI}-1`)).toEqual([]);
  });

  it("prices a kilo group at the store's cheapest per kilo, as Compare does", async () => {
    const [bulgur] = await searchAt("בורגול", `${SHUFERSAL}-1`); // 3.50 for 500 g; 6.80 a kilo at Osher Ad
    expect(bulgur).toMatchObject({ kind: "group", ref: "בורגול|kg", minPrice: 7 });
  });

  it("prices a group sold by weight at the store's cheapest per kilo", async () => {
    const [banana] = await searchAt("בננה", `${RAMI}-1`); // 5 a kilo at Osher Ad
    expect(banana).toMatchObject({ kind: "group", ref: "בננה|kg", soldBy: "weight", minPrice: 6.5 });
  });

  it("prices a unit group at the store's cheapest pack", async () => {
    const dozen = (await searchAt("ביצים", `${OSHER}-1`)).find((r) => r.ref === "ביצ|unit|12");
    expect(dozen).toMatchObject({ kind: "group", minPrice: 13.5 }); // 13 at Shufersal
  });

  it("leaves out a group with no product at the store", async () => {
    // Rami Levy prices only the olive cottage, which is not in the broad cottage group
    expect((await searchAt("קוטג", `${RAMI}-1`)).map((r) => [r.kind, r.name])).toEqual([["product", "קוטג עם זיתים 250 גרם"]]);
    expect(await searchAt("בורגול", `${RAMI}-1`)).toEqual([]);
  });

  it("returns [] for an unknown store", async () => {
    expect(await searchAt("בורגול", "nope-1")).toEqual([]);
  });

  it("400 on an invalid storeId", async () => {
    for (const storeId of ["", " ", "x".repeat(65)]) expect((await at("בורגול", storeId)).status, storeId).toBe(400);
  });

  it("401 without a session", async () => {
    expect((await at("בורגול", `${OSHER}-1`, false)).status).toBe(401);
  });

  it("leaves search without storeId as it was: every store, the cheapest price anywhere", async () => {
    const rows = await search("בורגול");
    expect(rows[0]).toMatchObject({ kind: "group", ref: "בורגול|kg", minPrice: 6.8, storeCount: 2 });
    expect(rows.filter((r) => r.kind === "product").map((r) => r.name)).toEqual(expect.arrayContaining(["בורגול גס מיה", "בורגול דק סוגת"]));
    expect((await search("חלב 3%")).find((r) => r.code === milk3)).toMatchObject({ minPrice: 5.5, storeCount: 2 });
  });

  it("finds the store's product even when over 3000 other products match first", async () => {
    const deps = buildDeps(loadConfig());
    const big = createApp(deps);
    const many: Item[] = Array.from({ length: 3001 }, (_, i) => [`p${i}`, `פסטה ${i}`, 5]);
    const chains: [string, string, Item[]][] = [["osher-ad", OSHER, many], ["shufersal", SHUFERSAL, many], ["rami-levy", RAMI, [["p-rami", "פסטה רמי", 6]]]];
    for (const [key, chain, items] of chains) {
      ingestStores(deps, key, storesXml(chain));
      ingestPrices(deps, key, pricesXml(chain, items));
    }
    const res = await big.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "cap@prices.test", password: "password1234", name: "Gal" }),
    });
    const auth = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const rows = (await (await big.request(`/api/products/search?q=${encodeURIComponent("פסטה")}&storeId=${RAMI}-1`, { headers: { cookie: auth } })).json()) as Row[];
    expect(rows.filter((r) => r.kind === "product").map((r) => r.name)).toEqual(["פסטה רמי"]);
  });
});

describe("product groups: leading and substitute words", () => {
  it.each([
    ["בורגול", "בורגול|kg", 5],
    ["גבינת קוטג", "קוטג|kg", 3],
    ["חלב", "חלב|l", 2],
    ["בננה", "בננה|kg", 4],
  ] as const)("%s names group %s of %i products", async (q, ref, count) => {
    expect((await groups(q))[0]).toMatchObject({ ref, productCount: count });
  });

  it.each(["קוטג' טבעוני", "חלב שקדים", "חלב סויה", "קוטג עם זיתים"])("%s alone is not a group of one", async (q) => {
    expect(await groups(q)).toEqual([]);
  });
});

describe("product groups: compare", () => {
  it("401 without a session", async () => {
    expect((await post({ ...here, groups: [{ ref: "בורגול|kg" }] }, false)).status).toBe(401);
  });

  it("charges each store its cheapest price per kilo for one commonest pack, so 1 kg at 6.80 beats 500 g at 3.70", async () => {
    const r = await compare({ groups: [{ ref: "בורגול|kg" }] }); // three of five bulgurs are 500 g
    const osher = groupItem(store(r, "Osher Ad"));
    expect(osher).toMatchObject({ ref: "בורגול|kg", code: sugatThick, name: "בורגול עבה סוגת", size: 1, unitPrice: 6.8, price: 3.4, quantity: 1, lineTotal: 3.4 });
    expect(store(r, "Osher Ad").total).toBe(3.4);
    expect(store(r, "Shufersal").total).toBe(3.5); // 3.50 for 500 g is 7/kg
    expect(r.stores.map((s) => s.chainName)).toEqual(["Osher Ad", "Shufersal"]);
  });

  it("multiplies a pack group's price by the quantity of packs", async () => {
    const r = await compare({ groups: [{ ref: "בורגול|kg", quantity: 5 }] });
    expect(store(r, "Osher Ad").total).toBe(17);
    expect(groupItem(store(r, "Shufersal"))).toMatchObject({ price: 3.5, quantity: 5, lineTotal: 17.5 });
  });

  it("charges a group sold by weight its cheapest price per kilo times the kilos", async () => {
    const r = await compare({ groups: [{ ref: "בננה|kg", quantity: 1.5 }] });
    expect(groupItem(store(r, "Osher Ad"))).toMatchObject({ unitPrice: 5, price: 5, quantity: 1.5, lineTotal: 7.5 });
    expect(r.stores.map((s) => [s.chainName, s.total])).toEqual([["Osher Ad", 7.5], ["Rami Levy", 9.75], ["Shufersal", 10.5]]);
  });

  it("charges liters the same way, and keeps condensed milk and plant drinks out of the choice", async () => {
    const r = await compare({ groups: [{ ref: "חלב|l" }] });
    expect(r.stores.map((s) => [s.chainName, s.total])).toEqual([["Shufersal", 5.5], ["Osher Ad", 6], ["Rami Levy", 6.2]]);
    expect(groupItem(store(r, "Osher Ad")).code).toBe(milk3); // not the 10 and 12 plant drinks, nor the 1% at 6.4
  });

  it("charges a unit group its cheapest pack times the number of packs, with no price per kilo", async () => {
    const r = await compare({ groups: [{ ref: "ביצ|unit|12", quantity: 2 }] });
    expect(r.stores.map((s) => [s.chainName, s.total])).toEqual([["Shufersal", 26], ["Osher Ad", 27], ["Rami Levy", 30]]);
    const osher = groupItem(store(r, "Osher Ad"));
    expect(osher).toMatchObject({ code: eggOsherM, name: "ביצים M 12 יח", size: 12, price: 13.5, quantity: 2, lineTotal: 27 });
    expect(osher).not.toHaveProperty("unitPrice");
    expect((await compare({ groups: [{ ref: "ביצ|unit|12" }] })).stores[0]!.total).toBe(13); // one pack by default
  });

  it("does not mix pack counts: an 18-pack is not charged for a 12-pack group", async () => {
    const r = await compare({ groups: [{ ref: "ביצ|unit|18" }] });
    expect(r.stores.map((s) => [s.chainName, s.total])).toEqual([["Shufersal", 19], ["Osher Ad", 20]]);
  });

  it("puts the store's priced lines in a cart link chain's orderUrl: whole packs, chain-local codes left out", async () => {
    const r = await compare({ groups: [{ ref: "ביצ|unit|12", quantity: 2 }, { ref: "חלב|l" }, { ref: "אורז|kg" }, { ref: "בננה|kg", quantity: 1.5 }] });
    // half a kilo of rice (the commonest pack) is one of Rami's 1 kg packs; its banana has Rami's own code, not a barcode
    const items = `${eggRamiL},2;${milk1},1;${riceRami},1`;
    expect(store(r, "Rami Levy")).toMatchObject({ matched: 4, orderUrl: `https://www.rami-levy.co.il/he/basket?items=${encodeURIComponent(items)}`, fillsCart: true });
    expect(store(r, "Osher Ad")).toMatchObject({ orderUrl: null, fillsCart: false });
  });

  it("reports a store with no product of the group as missing it", async () => {
    const r = await compare({ items: q([milk1]), groups: [{ ref: "בורגול|kg" }] });
    expect(store(r, "Rami Levy")).toMatchObject({ matched: 1, total: 6.2, missingCodes: ["בורגול|kg"] });
    expect(store(r, "Osher Ad")).toMatchObject({ matched: 2 });
    expect(r.unmatched).toEqual([]);
  });

  it("keeps a flavoured cottage out of the broad group: a store with only that is missing the group", async () => {
    const r = await compare({ items: q([milk1]), groups: [{ ref: "קוטג|kg" }] });
    expect(store(r, "Rami Levy").missingCodes).toEqual(["קוטג|kg"]);
    expect(groupItem(store(r, "Osher Ad")).name).not.toContain("זיתים");
  });

  it("mixes codes and groups in one body, with missing and unmatched naming both", async () => {
    const r = await compare({ items: q([milk3, nobody]), groups: [{ ref: "בננה|kg" }, { ref: "גזר|kg" }, { ref: "אבגד|kg" }] });
    expect(store(r, "Osher Ad")).toMatchObject({ total: 6 + 5 + 3, matched: 3, missingCodes: [nobody, "אבגד|kg"] });
    expect(store(r, "Shufersal")).toMatchObject({ total: 5.5 + 7 + 2.5, matched: 3 });
    expect(store(r, "Rami Levy")).toMatchObject({ total: 6.5, matched: 1, missingCodes: [milk3, nobody, "גזר|kg", "אבגד|kg"] });
    expect(r.unmatched).toEqual([nobody, "אבגד|kg"]);
    expect(store(r, "Osher Ad").items[0]).toEqual({ code: milk3, price: 6, quantity: 1, lineTotal: 6 });
  });

  it("charges packed carrots only to packed carrot groups", async () => {
    const loose = await compare({ groups: [{ ref: "גזר|kg" }] });
    expect(loose.stores.map((s) => [s.chainName, s.total])).toEqual([["Shufersal", 2.5], ["Osher Ad", 3]]);
    expect(groupItem(store(loose, "Osher Ad")).name).toBe("גזר תפזורת");
    const packed = await compare({ groups: [{ ref: "גזר ארוז|kg" }] });
    expect(packed.stores.map((s) => [s.chainName, s.total])).toEqual([["Osher Ad", 4], ["Shufersal", 4.5]]);
  });

  it("prices a group whose products are spelled with a doubled yod", async () => {
    const r = await compare({ groups: [{ ref: "סידר|l" }] });
    expect(r.stores.map((s) => [s.chainName, s.total])).toEqual([["Shufersal", 8], ["Osher Ad", 9]]);
  });

  it("totals price times quantity, summing two items matched to one product", async () => {
    const r = await compare({ items: [{ code: milk3, quantity: 1 }, { code: milk3, quantity: 2 }] });
    expect(store(r, "Osher Ad")).toMatchObject({ total: 18, matched: 1, items: [{ code: milk3, price: 6, quantity: 3, lineTotal: 18 }] });
    expect(store(r, "Shufersal").total).toBe(16.5);
  });

  it("ranks by the basket's quantities: a store dearer per kilo loses once more kilos are bought", async () => {
    const ranked = async (kilos: number) =>
      (await compare({ items: [{ code: milk3, quantity: 4 }], groups: [{ ref: "בננה|kg", quantity: kilos }] })).stores
        .filter((s) => s.matched === 2)
        .map((s) => [s.chainName, s.total]);
    expect(await ranked(0.5)).toEqual([["Shufersal", 25.5], ["Osher Ad", 26.5]]); // milk 5.50 vs 6
    expect(await ranked(3)).toEqual([["Osher Ad", 39], ["Shufersal", 43]]); // bananas 5 vs 7 a kilo
  });

  it("returns no stores and the group unmatched when nothing is in it", async () => {
    expect(await compare({ groups: [{ ref: "אבגד|kg" }] })).toEqual({ stores: [], unmatched: ["אבגד|kg"] });
  });

  it("400 on a body with neither items nor groups", async () => {
    expect((await post({ ...here })).status).toBe(400);
    expect((await post({ ...here, items: [], groups: [] })).status).toBe(400);
  });

  it("400 on a malformed group ref or quantity", async () => {
    for (const ref of ["x|kg|3", "x|foo", "x", "|kg", "x|unit", "x|unit|0", "x|unit|1.5", "x|kg|1|2", "", "a\"b|kg", "a  b|kg", "a*|kg", "א|kg", "א ב|kg"])
      expect((await post({ ...here, groups: [{ ref }] })).status, ref).toBe(400);
    for (const quantity of [0, -1, "2", 100]) expect((await post({ ...here, groups: [{ ref: "בורגול|kg", quantity }] })).status, String(quantity)).toBe(400);
  });
});

// Last in the file: Rami Levy's online store (StoreId 39, no location) changes the groups' store counts that search reports.
describe("product groups: cart link from the chain's online store", () => {
  it("buys each group's product the online store prices cheapest, else the one priced at the branch", async () => {
    ingestStores(deps, "rami-levy", storesXml(RAMI, "39", "מרלוג אינטרנט"));
    ingestPrices(deps, "rami-levy", pricesXml(RAMI, [
      [eggRamiL, "ביצים L 12 יח", 15],
      [eggShufM, "ביצים M 12 יח", 14], // cheaper online than the branch's only dozen
      ["e1", "ביצים L 12 יח", 1], // cheapest, but a chain-local code no shop knows
      [riceRami, "אורז בסמטי רמי לוי", 11, kg],
      [riceSugat, "אורז בסמטי סוגת", 5, g500], // 10 a kilo beats 11: one of the half-kilo packs the Item counts
      ["5", "בננה במשקל", 6.5, W],
      [miaCoarse, "בורגול גס מיה", 3.6, g500], // the branch has no bulgur
    ], "39"));
    const r = await compare({ groups: [{ ref: "ביצ|unit|12", quantity: 2 }, { ref: "חלב|l" }, { ref: "אורז|kg" }, { ref: "בננה|kg", quantity: 1.5 }, { ref: "בורגול|kg" }] });
    // the online store prices no milk, so the branch's stays; the banana is chain-local both ways; the bulgur the branch
    // is missing comes from the online store, one of the half-kilo packs the Item counts
    const items = `${eggShufM},2;${milk1},1;${riceSugat},1;${miaCoarse},1`;
    const rami = store(r, "Rami Levy");
    expect(rami).toMatchObject({ matched: 4, missingCodes: ["בורגול|kg"], orderUrl: `https://www.rami-levy.co.il/he/basket?items=${encodeURIComponent(items)}`, fillsCart: true });
    expect(groupItem(rami)).toMatchObject({ code: eggRamiL, price: 15 }); // the branch's lines are still its own
    expect(r.stores.map((s) => s.storeName)).not.toContain("מרלוג אינטרנט"); // no location, never compared
  });
});
