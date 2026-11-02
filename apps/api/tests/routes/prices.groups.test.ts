import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { isGtin } from "#/ingest/parse.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const SHUFERSAL = "7290027600007";
const RAMI = "7290058140886";
const here = { lat: 32.0853, lng: 34.7818 };
const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
const milk = gtin("729000006631");

type Item = [code: string, name: string, price: number, opts?: { weighted?: boolean; unit?: string }];
const storesXml = (chain: string) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: string, items: Item[]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
    .map(([code, name, price, o]) => `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${o?.unit ?? "קילוגרם"}</UnitQty><Quantity>1.00</Quantity><bIsWeighted>${o?.weighted === false ? 0 : 1}</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

let app: ReturnType<typeof createApp>;
let cookie: string;

beforeAll(async () => {
  expect(isGtin(milk)).toBe(true);
  const deps = buildDeps(loadConfig());
  app = createApp(deps);
  const load = (key: string, chain: string, items: Item[]) => {
    ingestStores(deps, key, storesXml(chain));
    ingestPrices(deps, key, pricesXml(chain, items));
  };
  const litre = { weighted: false, unit: "ליטר" };
  // Osher Ad carries two banana products (a store is charged the cheaper) and both carrots.
  load("osher-ad", OSHER, [
    ["111", "בננות", 6],
    ["112", "בננה מובחרת", 5],
    ["121", "גזר תפזורת", 3],
    ["122", "גזר ארוז", 4],
    [milk, "חלב 3%", 6, litre],
  ]);
  load("shufersal", SHUFERSAL, [["11", "בננה", 7], ["21", "גזר", 2.5], [milk, "חלב 3%", 5.5, litre]]);
  load("rami-levy", RAMI, [["5", "בננה במשקל", 6.5]]);
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

type Found = { code: string; name: string; storeCount: number; minPrice: number };
type Store = { chainName: string; total: number };
const search = async (q: string) => (await (await app.request(`/api/products/search?q=${encodeURIComponent(q)}`, { headers: { cookie } })).json()) as Found[];
const compare = (codes: string[], auth = true) =>
  app.request("/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { cookie } : {}) },
    body: JSON.stringify({ ...here, codes }),
  });
const totals = (r: { stores: Store[] }) => r.stores.map((s) => [s.chainName, s.total]);

describe("produce groups: search", () => {
  it("returns one banana row across chains with distinct store count and min price", async () => {
    const rows = await search("בננה");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "בננה", storeCount: 3, minPrice: 5 });
    expect([`${OSHER}:111`, `${OSHER}:112`, `${SHUFERSAL}:11`, `${RAMI}:5`]).toContain(rows[0]!.code);
  });

  it("shows loose and packed carrots as two results with display names", async () => {
    const rows = await search("גזר");
    expect(rows.map((r) => r.name).sort()).toEqual(["גזר", "גזר ארוז"]);
    expect(rows.find((r) => r.name === "גזר")).toMatchObject({ storeCount: 2, minPrice: 2.5 });
    expect(rows.find((r) => r.name === "גזר ארוז")).toMatchObject({ storeCount: 1, minPrice: 4 });
  });

  it("leaves a barcoded product as before", async () => {
    expect(await search(milk)).toEqual([{ code: milk, name: "חלב 3%", manufacturer: null, unitQty: "1 ליטר", storeCount: 2, minPrice: 5.5 }]);
  });
});

describe("produce groups: compare", () => {
  it("401 without a session", async () => {
    expect((await compare([`${OSHER}:111`], false)).status).toBe(401);
  });

  it("finds every chain from one chain's banana code, each at its cheapest member, under the requested code", async () => {
    const code = `${SHUFERSAL}:11`;
    const r = await (await compare([code])).json();
    expect(totals(r)).toEqual([["Osher Ad", 5], ["Rami Levy", 6.5], ["Shufersal", 7]]); // Osher carries 6 and 5
    for (const s of r.stores) {
      expect(s.items).toEqual([{ code, price: s.total }]);
      expect(s.matched).toBe(1);
      expect(s.missingCodes).toEqual([]);
    }
    expect(r.unmatched).toEqual([]);
  });

  it("keeps packed carrots out of a loose carrot compare", async () => {
    const r = await (await compare([`${OSHER}:121`])).json();
    expect(totals(r)).toEqual([["Shufersal", 2.5], ["Osher Ad", 3]]);
  });

  it("mixes a grouped code and a barcode; missing codes stay as requested", async () => {
    const nobody = "7290000000000";
    const r = await (await compare([`${RAMI}:5`, milk, nobody])).json();
    const by = (name: string) => r.stores.find((s: Store) => s.chainName === name);
    expect(by("Rami Levy")).toMatchObject({ total: 6.5, matched: 1, missingCodes: [milk, nobody] });
    expect(by("Shufersal")).toMatchObject({ total: 12.5, matched: 2, missingCodes: [nobody] });
    expect(r.unmatched).toEqual([nobody]);
  });
});
