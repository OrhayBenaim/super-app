import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const storesXml = `<Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const names = [
  ["1", "יין אדום 750 מל"], ["2", "יין לבן 750 מל"], ["3", "יין 750 מל"],
  ["4", "פדים 14 יח"], ["5", "פדים עבים 14 יח"],
  ["6", "10 פיתות"], ["7", "פיתות 10 יח"],
  ["8", "עגבנייה 1 קג"], ["9", "עגבניה 1 קג"],
  ["10", "100% מיץ רימונים"], ["11", "100% מיץ רימונים סחוט"], ["12", "מיץ רימונים 4 יח"], ["13", "מיץ רימונים סחוט 4 יח"],
];
const pricesXml = `<Root><ChainID>${OSHER}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${names
  .map(([code, name]) => `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>יחידות</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>10</ItemPrice><UnitOfMeasurePrice>10</UnitOfMeasurePrice></Item>`)
  .join("")}</Items></Root>`;

let app: ReturnType<typeof createApp>;
let cookie: string;
beforeAll(async () => {
  const deps = buildDeps(loadConfig());
  app = createApp(deps);
  ingestStores(deps, "osher-ad", storesXml);
  ingestPrices(deps, "osher-ad", pricesXml);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "stem@prices.test", password: "password1234", name: "Sara" }),
  });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});
type Row = { kind: string; ref?: string; name: string; productCount?: number };
const groups = async (q: string) =>
  ((await (await app.request(`/api/products/search?q=${encodeURIComponent(q)}`, { headers: { cookie } })).json()) as Row[]).filter((r) => r.kind === "group");

describe("group word spelling", () => {
  it("keeps a word's leading יי, so wine is one group named יין", async () => {
    const g = await groups("יין");
    expect(g.map((r) => r.ref)).toEqual(["יין|l"]);
    expect(g[0]!.name).toBe("יין");
  });

  it("still matches עגבנייה and עגבניה as one word", async () => {
    expect((await groups("עגבנייה"))[0]!.productCount).toBe(2);
  });

  it("keeps a plural ending when fewer than 3 letters would remain", async () => {
    const g = await groups("פדים");
    expect(g.map((r) => r.ref)).toEqual(["פדים|unit|14"]);
  });

  it("never makes a leading number a group word and reads it as the pack count", async () => {
    const g = await groups("פיתות");
    expect(g.map((r) => r.ref)).toEqual(["פיתה|unit|10"]);
    expect(g[0]!.productCount).toBe(2);
    expect(await groups("10 פיתות")).toEqual(g);
  });

  it("never reads a leading percent as a pack count: 100% juice is one unit, not a 100-pack", async () => {
    expect((await groups("מיץ רימונים")).map((r) => r.ref).sort()).toEqual(["מיץ רימונ|unit|1", "מיץ רימונ|unit|4"]);
  });
});
