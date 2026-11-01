import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDeps } from "#/deps.ts";
import { ingestPricesJob } from "#/jobs/ingest-prices.ts";
import { loadConfig } from "#/services/config.ts";

const fx = (f: string) => fileURLToPath(new URL(`../__fixtures__/${f}`, import.meta.url));
const count = (deps: ReturnType<typeof buildDeps>, table: string) =>
  (deps.db.$client.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

describe("ingestPricesJob", () => {
  it("ingests the stores file and the price files", async () => {
    const deps = buildDeps(loadConfig());
    await ingestPricesJob(deps)({
      chain: "osher-ad",
      stores: fx("Stores7290103152017-000-20261021-080500.xml"),
      prices: [fx("PriceFull7290103152017-001-001-20261021-051600.gz"), fx("PriceFull7290103152017-001-002-20261021-051600.xml")],
    });
    expect(count(deps, "stores")).toBeGreaterThan(0);
    expect(count(deps, "prices")).toBeGreaterThan(0);
  });

  it("loads each PriceFull into the store its file name names (Carrefour's files carry an old StoreID inside)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "grocer-ingest-"));
    const renamed = join(dir, "PriceFull7290103152017-001-004-20261021-051600.gz");
    copyFileSync(fx("PriceFull7290103152017-001-001-20261021-051600.gz"), renamed);
    const deps = buildDeps(loadConfig());
    try {
      await ingestPricesJob(deps)({ chain: "osher-ad", stores: fx("Stores7290103152017-000-20261021-080500.xml"), prices: [renamed] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(deps.db.$client.prepare("SELECT DISTINCT store_id FROM prices").all()).toEqual([{ store_id: "7290103152017-4" }]);
  });

  it("fails when every price file is skipped (no Stores file loaded for its store)", async () => {
    const run = ingestPricesJob(buildDeps(loadConfig()))({ chain: "osher-ad", prices: [fx("PriceFull7290103152017-001-001-20261021-051600.gz")] });
    await expect(run).rejects.toThrow(/no prices loaded from any of 1 --prices files/);
  });

  it("rejects data with neither stores nor prices", async () => {
    await expect(ingestPricesJob(buildDeps(loadConfig()))({ chain: "osher-ad" })).rejects.toThrow(/--stores/);
  });
});
