import { describe, expect, it } from "vitest";
import { buildDeps } from "#/deps.ts";
import { fillProduceGroups, ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { isGtin } from "#/ingest/parse.ts";
import { loadConfig } from "#/services/config.ts";

const CHAIN = "7290103152017";
const base = "729000006631";
const GTIN = base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
const item = (code: string, name: string, weighted: number, unit = "קילוגרם") =>
  `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${unit}</UnitQty><Quantity>1.00</Quantity><bIsWeighted>${weighted}</bIsWeighted><ItemPrice>5</ItemPrice><UnitOfMeasurePrice>5</UnitOfMeasurePrice></Item>`;
const stores = `<Root><ChainID>${CHAIN}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>x</StoreName><Address>a</Address><City>c</City></Store></Stores></SubChain></SubChains></Root>`;
const prices = (...items: string[]) => `<Root><ChainID>${CHAIN}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items.join("")}</Items></Root>`;

const setup = () => {
  const deps = buildDeps(loadConfig());
  ingestStores(deps, "osher-ad", stores);
  return deps;
};
const keys = (deps: ReturnType<typeof setup>) =>
  Object.fromEntries((deps.db.$client.prepare("SELECT code, group_key AS k FROM products").all() as { code: string; k: string | null }[]).map((r) => [r.code, r.k]));

describe("group_key", () => {
  it("ingestPrices writes it for grouped products and leaves barcoded ones null", () => {
    expect(isGtin(GTIN)).toBe(true);
    const deps = setup();
    ingestPrices(deps, "osher-ad", prices(item("111", "בננות", 1), item("222", "חלב", 0, "ליטר"), item(GTIN, "קולה", 0, "ליטר")));
    expect(keys(deps)).toEqual({ [`${CHAIN}:111`]: "בננה|weight", [`${CHAIN}:222`]: "חלב|unit", [GTIN]: null });
  });

  it("a later ingest keeps the existing key", () => {
    const deps = setup();
    ingestPrices(deps, "osher-ad", prices(item("111", "בננות", 1)));
    ingestPrices(deps, "osher-ad", prices(item("111", "בננות ישראל", 1)));
    expect(keys(deps)[`${CHAIN}:111`]).toBe("בננה|weight");
  });

  it("fillProduceGroups backfills NULL keys of weighted and chain-local rows only", () => {
    const deps = setup();
    ingestPrices(deps, "osher-ad", prices(item("111", "גזר תפזורת", 1), item("222", "חלב", 0, "ליטר"), item(GTIN, "קולה", 0, "ליטר")));
    deps.db.$client.prepare("UPDATE products SET group_key = NULL").run();
    fillProduceGroups(deps);
    expect(keys(deps)).toEqual({ [`${CHAIN}:111`]: "גזר|weight", [`${CHAIN}:222`]: "חלב|unit", [GTIN]: null });
  });
});
