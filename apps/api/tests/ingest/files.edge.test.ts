// QA edge cases for the pure helpers of files.ts (no network).
import { describe, expect, it } from "vitest";
import { parseFileName, pickFiles } from "#/ingest/files.ts";

const KESHET = "7290785400000";
const CARREFOUR = "7290055700007";
const file = (name: string) => ({ name, url: `/file/d/${name}` });

describe("parseFileName", () => {
  it("handles 5-segment and 3-segment names, any case, any extension", () => {
    expect(parseFileName(`PriceFull${KESHET}-001-014-20261101-001002.gz`)).toEqual({ type: "pricefull", key: `${KESHET}-001-014`, ts: "20261101001002" });
    expect(parseFileName(`PriceFull${KESHET}-002-202611010010.gz`)).toEqual({ type: "pricefull", key: `${KESHET}-002`, ts: "20261101001000" });
    expect(parseFileName(`PRICEFULL${KESHET}-002-202611010010.XML`)?.key).toBe(`${KESHET}-002`);
    expect(parseFileName(`Stores${KESHET}-000-20261101-051000.xml`)).toEqual({ type: "stores", key: `${KESHET}-000`, ts: "20261101051000" });
    expect(parseFileName(`PriceFull${KESHET}-001-014-20261101-001002`)?.ts).toBe("20261101001002"); // no extension
  });
  it("pads short times on the right (Shufersal Stores publishes -020) and keeps 4- and 5-digit forms sortable", () => {
    expect(parseFileName("Stores7290027600007-000-20261101-020.gz")?.ts).toBe("20261101020000");
    expect(parseFileName("Stores7290027600007-000-20261101-0215.gz")?.ts).toBe("20261101021500");
    expect(parseFileName("Stores7290027600007-000-20261101-02150.gz")?.ts).toBe("20261101021500");
  });
  it("returns null for listing noise: no digits, directories, missing timestamp, too-short time, other extensions", () => {
    for (const n of ["", "sub", "Stores", `PriceFull${KESHET}.gz`, `PriceFull${KESHET}-001-014.gz`, `PriceFull${KESHET}-001-014-20261101-01.gz`, `PriceFull${KESHET}-001-014-2026110-001002.gz`, "readme.txt"])
      expect(parseFileName(n), n).toBeNull();
  });
  it("labels Price and Promo files as other types (pickFiles ignores them)", () => {
    expect(parseFileName(`Price${KESHET}-001-014-20261101-001002.gz`)?.type).toBe("price");
    expect(parseFileName(`PromoFull${KESHET}-001-014-20261101-001002.gz`)?.type).toBe("promofull");
    expect(parseFileName(`Promo${KESHET}-001-014-20261101-001002.gz`)?.type).toBe("promo");
  });
});

describe("pickFiles", () => {
  const listing = [
    file(`PriceFull${KESHET}-001-014-20261101-001002.gz`),
    file(`PriceFull${KESHET}-001-014-20261031-001002.gz`), // older, same store
    file(`PriceFull${KESHET}-001-014-20261101-090000.gz`), // newer, listed after and before others
    file(`PriceFull${KESHET}-001-021-20261101-001001.gz`),
    file(`PriceFull${KESHET}-002-202611010010.gz`), // 3-segment store
    file(`Price${KESHET}-001-014-20261101-120000.gz`), // wrong type
    file(`PromoFull${KESHET}-001-014-20261101-120000.gz`),
    file(`PriceFull${CARREFOUR}-0820-202403281445.gz`), // Keshet's account also lists Carrefour's 2024 file
    file(`Stores${CARREFOUR}-000-20240328-144500.xml`),
    file(`Stores${KESHET}-000-20261031-051000.xml`),
    file(`Stores${KESHET}-000-20261101-051000.xml`),
    file("sub"),
  ];

  it("keeps only the chain's own ids, the newest file per store key, and the newest Stores file", () => {
    const { stores, prices } = pickFiles(listing, 10, [KESHET]);
    expect(stores?.name).toBe(`Stores${KESHET}-000-20261101-051000.xml`);
    expect(prices.map((p) => p.name)).toEqual([
      `PriceFull${KESHET}-001-014-20261101-090000.gz`,
      `PriceFull${KESHET}-001-021-20261101-001001.gz`,
      `PriceFull${KESHET}-002-202611010010.gz`,
    ]);
  });

  it("the Carrefour files are picked when asking for Carrefour, never for Keshet", () => {
    const c = pickFiles(listing, 10, [CARREFOUR]);
    expect(c.stores?.name).toContain(CARREFOUR);
    expect(c.prices.map((p) => p.name)).toEqual([`PriceFull${CARREFOUR}-0820-202403281445.gz`]);
  });

  it("accepts several chain ids (Victory) and none (nothing selected)", () => {
    expect(pickFiles(listing, 10, [CARREFOUR, KESHET]).prices).toHaveLength(4);
    expect(pickFiles(listing, 10, [])).toEqual({ stores: undefined, prices: [] });
  });

  it("returns no Stores file when the listing has none for the chain, and an oversized cap returns everything", () => {
    expect(pickFiles(listing.filter((f) => !f.name.startsWith("Stores")), 99, [KESHET]).stores).toBeUndefined();
    expect(pickFiles(listing, 99, [KESHET]).prices).toHaveLength(3);
  });

  it("an equal timestamp keeps the first listed file (stable), and later days beat earlier days across month ends", () => {
    const eq = pickFiles([file(`PriceFull${KESHET}-001-001-20261101-001000.gz`), file(`PriceFull${KESHET}-001-001-20261101-001000.xml`)], 5, [KESHET]);
    expect(eq.prices.map((p) => p.name)).toEqual([`PriceFull${KESHET}-001-001-20261101-001000.gz`]);
    const month = pickFiles([file(`PriceFull${KESHET}-001-001-20261031-235959.gz`), file(`PriceFull${KESHET}-001-001-20261101-000001.gz`)], 5, [KESHET]);
    expect(month.prices[0]!.name).toContain("20261101");
  });

  it("works on a Shufersal-shaped listing: 3-digit Stores time and the newest of two Stores files", () => {
    const s = "7290027600007";
    const { stores, prices } = pickFiles(
      [file(`Stores${s}-000-20261101-020.gz`), file(`Stores${s}-000-20261031-230000.gz`), file(`PriceFull${s}-001-001-20261101-032630.gz`), file(`PriceFull${s}-001-002-20261101-032630.gz`)],
      1,
      [s],
    );
    expect(stores?.name).toBe(`Stores${s}-000-20261101-020.gz`);
    expect(prices.map((p) => p.name)).toEqual([`PriceFull${s}-001-001-20261101-032630.gz`]);
  });
});
