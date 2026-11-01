import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDeps } from "#/deps.ts";
import { fetchPricesJob, type FetchPricesData } from "#/jobs/fetch-prices.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const OLD_STORES = `Stores${OSHER}-000-20261020-080500.xml`;
const NEW_STORES = `Stores${OSHER}-000-20261021-080500.xml`;
const xml = (s: string) => new TextEncoder().encode(`<Root>${s}</Root>`);
const files = {
  [OLD_STORES]: xml("old stores"),
  [NEW_STORES]: xml("new stores"),
  [`PriceFull${OSHER}-001-001-20261020-051600.xml`]: xml("old 1"),
  [`PriceFull${OSHER}-001-001-20261021-051600.xml`]: xml("new 1"),
  [`PriceFull${OSHER}-001-002-20261021-051600.xml`]: xml("new 2"),
  [`PriceFull${OSHER}-001-003-20261021-051600.xml`]: xml("new 3"),
};

let out: string;
const run = (portalFiles: Record<string, Uint8Array>, data: Partial<FetchPricesData> = {}) =>
  fetchPricesJob({ ...buildDeps(loadConfig()), pricePortal: fakePricePortal(portalFiles) })({ chain: "osher-ad", out, ...data });

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "grocer-fetch-"));
});
afterEach(() => rmSync(out, { recursive: true, force: true }));

describe("fetchPricesJob", () => {
  it("saves the newest Stores file and the newest PriceFull of each store", async () => {
    const saved = await run(files, { maxStores: 2 });
    expect(saved.map((p) => p.slice(out.length + 1))).toEqual([
      NEW_STORES,
      `PriceFull${OSHER}-001-001-20261021-051600.xml`,
      `PriceFull${OSHER}-001-002-20261021-051600.xml`,
    ]);
    expect(readdirSync(out)).toHaveLength(3);
  });

  it("maxStores defaults to 3", async () => {
    expect(await run(files)).toHaveLength(4);
  });

  it("storesOnly saves just the Stores file", async () => {
    expect(await run(files, { storesOnly: true })).toHaveLength(1);
  });

  it("throws when there is no Stores file", async () => {
    const noStores = Object.fromEntries(Object.entries(files).filter(([name]) => !name.startsWith("Stores")));
    await expect(run(noStores)).rejects.toThrow(/no Stores file/);
  });

  it("throws when a downloaded file is not a price file", async () => {
    const html = { ...files, [NEW_STORES]: new TextEncoder().encode("<html><body>login</body></html>") };
    await expect(run(html)).rejects.toThrow(/not a price file/);
  });
});
