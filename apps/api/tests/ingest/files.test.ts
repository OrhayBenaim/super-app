import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newestFullAndUpdate, parseFileName, pickFiles } from "#/ingest/files.ts";

const fixture = (name: string) => readFileSync(new URL(`../__fixtures__/real/${name}`, import.meta.url), "utf8");
const RAMI = "7290058140886";

describe("file names", () => {
  it("parses 5-segment, 3-segment and Shufersal's short-time names", () => {
    expect(parseFileName(`PriceFull${RAMI}-001-039-20261101-001003.gz`)).toEqual({ type: "pricefull", key: `${RAMI}-001-039`, ts: "20261101001003" });
    expect(parseFileName(`pricefull${RAMI}-039-202611010514.gz`)).toEqual({ type: "pricefull", key: `${RAMI}-039`, ts: "20261101051400" });
    expect(parseFileName("Stores7290027600007-000-20261101-020")).toEqual({ type: "stores", key: "7290027600007-000", ts: "20261101020000" });
    expect(parseFileName("sub")).toBeNull();
  });

  it("parses laibcatalog's Stores name, whose time follows the date and repeats after a dash (live, 2026-11-01)", () => {
    expect(parseFileName("Stores7290696200003-000-20261101060100-060100.gz")).toEqual({ type: "stores", key: "7290696200003-000", ts: "20261101060100" });
    const mshuk = ["060059", "060100"].map((t) => ({ name: `Stores7290661400001-000-20261101${t}-${t}.gz`, url: t }));
    expect(pickFiles(mshuk, 0, ["7290661400001"]).stores?.url).toBe("060100");
  });
});

describe("pickFiles on a captured Rami Levy listing", () => {
  const listing = JSON.parse(fixture("cerberus-dir.json")) as { aaData: { name: string; type: string }[] };
  const files = listing.aaData.filter((f) => f.type === "file").map((f) => ({ name: f.name, url: `/file/d/${f.name}` }));

  it("takes the newest Stores and the newest PriceFull per store, skipping Price/Promo and other chains", () => {
    const { stores, prices } = pickFiles(files, 10, [RAMI]);
    expect(stores?.name).toBe(`Stores${RAMI}-000-20261101-050500.xml`);
    expect(prices.map((p) => p.name)).toEqual([
      `PriceFull${RAMI}-001-001-20261101-001003.gz`,
      `PriceFull${RAMI}-001-003-20261101-060015.gz`,
      `pricefull${RAMI}-039-202611010514.gz`,
    ]);
  });

  it("caps the number of stores", () => {
    expect(pickFiles(files, 1, [RAMI]).prices).toHaveLength(1);
    expect(pickFiles(files, 0, [RAMI]).prices).toEqual([]);
  });
});

describe("pickFiles on Hazi Hinam's names", () => {
  const HAZI = "7290700100008";
  const f = (name: string) => ({ name, url: `https://blob/${name}` });

  it("takes the newest StoresFull as the Stores file, and the newest of a store's many PriceFull files", () => {
    const { stores, prices } = pickFiles(
      [
        f(`StoresFull${HAZI}-000-20261103-010530.gz`),
        f(`StoresFull${HAZI}-000-20261104-010530.gz`),
        f(`PriceFull${HAZI}-000-219-20261104-221427.gz`),
        f(`PriceFull${HAZI}-000-219-20261104-231501.gz`),
        f(`Price${HAZI}-000-219-20261104-235534.gz`),
      ],
      9,
      [HAZI],
    );
    expect(stores?.name).toBe(`StoresFull${HAZI}-000-20261104-010530.gz`);
    expect(prices.map((p) => [p.name, p.update?.name])).toEqual([[`PriceFull${HAZI}-000-219-20261104-231501.gz`, `Price${HAZI}-000-219-20261104-235534.gz`]]);
  });
});

describe("newestFullAndUpdate", () => {
  const K = `${RAMI}-001-014`;
  const f = (name: string) => ({ name, url: name });

  it("pairs each store's newest full file with its newest update strictly after it", () => {
    const files = [
      f(`PriceFull${K}-20261101-000000.gz`),
      f(`PriceFull${K}-20261102-000000.gz`),
      f(`Price${K}-20261101-120000.gz`), // before the newest full file
      f(`Price${K}-20261102-060000.gz`),
      f(`Price${K}-20261102-100000.gz`),
      f(`PriceFull${RAMI}-001-015-20261102-000000.gz`),
      f(`Price${RAMI}-001-015-20261102-000000.gz`), // same time as its full file: not after
      f(`PriceFull9999999999999-001-014-20261102-000000.gz`), // another chain
    ];
    const picked = newestFullAndUpdate(files, [RAMI], "pricefull", "price");
    expect([...picked.keys()].sort()).toEqual([K, `${RAMI}-001-015`]);
    expect(picked.get(K)?.name).toBe(`PriceFull${K}-20261102-000000.gz`);
    expect(picked.get(K)?.update?.name).toBe(`Price${K}-20261102-100000.gz`);
    expect(picked.get(`${RAMI}-001-015`)?.update).toBeUndefined();
  });

  it("works for another file kind (promofull + promo)", () => {
    const files = [f(`PromoFull${K}-20261102-000000.gz`), f(`Promo${K}-20261102-090000.gz`), f(`Price${K}-20261102-090000.gz`)];
    expect(newestFullAndUpdate(files, [RAMI], "promofull", "promo").get(K)?.update?.name).toBe(`Promo${K}-20261102-090000.gz`);
  });

  it("pickFiles gives each price file its update", () => {
    const files = [f(`Stores${RAMI}-000-20261101-050500.xml`), f(`PriceFull${K}-20261102-000000.gz`), f(`Price${K}-20261102-100000.gz`)];
    const { prices } = pickFiles(files, 10, [RAMI]);
    expect(prices.map((p) => [p.name, p.update?.name])).toEqual([[`PriceFull${K}-20261102-000000.gz`, `Price${K}-20261102-100000.gz`]]);
  });
});
