import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { looksLikePriceFile, parseFileName, pickFiles } from "#/ingest/files.ts";

const fixture = (name: string) => readFileSync(new URL(`../__fixtures__/real/${name}`, import.meta.url), "utf8");
const RAMI = "7290058140886";

describe("file names", () => {
  it("parses 5-segment, 3-segment and Shufersal's short-time names", () => {
    expect(parseFileName(`PriceFull${RAMI}-001-039-20261101-001003.gz`)).toEqual({ type: "pricefull", key: `${RAMI}-001-039`, ts: "20261101001003" });
    expect(parseFileName(`pricefull${RAMI}-039-202611010514.gz`)).toEqual({ type: "pricefull", key: `${RAMI}-039`, ts: "20261101051400" });
    expect(parseFileName("Stores7290027600007-000-20261101-020")).toEqual({ type: "stores", key: "7290027600007-000", ts: "20261101020000" });
    expect(parseFileName("sub")).toBeNull();
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

describe("looksLikePriceFile", () => {
  it("accepts gzip, zip and XML (with BOMs) and rejects an HTML login page", () => {
    expect(looksLikePriceFile(new Uint8Array([0x1f, 0x8b, 8, 0]))).toBe(true);
    expect(looksLikePriceFile(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(true);
    expect(looksLikePriceFile(Buffer.from('﻿<?xml version="1.0"?><Root/>', "utf8"))).toBe(true);
    expect(looksLikePriceFile(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("<Root>", "utf16le")]))).toBe(true);
    expect(looksLikePriceFile(Buffer.from("<!DOCTYPE html><html><body>login</body></html>"))).toBe(false);
    expect(looksLikePriceFile(Buffer.from("<html><body>302</body></html>"))).toBe(false);
  });
});
