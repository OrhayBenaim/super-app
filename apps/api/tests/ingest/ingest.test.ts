import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "better-sqlite3";
import { buildDeps } from "#/deps.ts";
import * as ing from "#/ingest/ingest.ts";
import { isGtin } from "#/ingest/parse.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

let sqlite: Database;
let deps: ReturnType<typeof buildDeps>;
let tmp: string;

const OSHER = "7290103152017";
const RAMI = "7290058140886";
const VICTORY = ["7290696200003", "7290058103393"];
const fixture = (name: string) => fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));

type S = { id: string; name?: string; address?: string; city?: string };
const storesXml = (chain: string, stores: S[]) =>
  `<Root><ChainId>${chain}</ChainId><Stores>${stores
    .map((s) => `<Store><StoreId>${s.id}</StoreId><StoreName>${s.name ?? "n"}</StoreName><Address>${s.address ?? "a"}</Address><City>${s.city ?? "c"}</City></Store>`)
    .join("")}</Stores></Root>`;
type I = { code: string; price?: number | string; name?: string; manufacturer?: string; unitPrice?: number };
const pricesXml = (chain: string, store: string, items: I[]) =>
  `<Root><ChainId>${chain}</ChainId><StoreId>${store}</StoreId><Items>${items
    .map(
      (i) =>
        `<Item><ItemCode>${i.code}</ItemCode><ItemName>${i.name ?? `item ${i.code}`}</ItemName><ManufacturerName>${i.manufacturer ?? ""}</ManufacturerName>` +
        `<ItemPrice>${i.price ?? 1}</ItemPrice><UnitOfMeasurePrice>${i.unitPrice ?? 0}</UnitOfMeasurePrice></Item>`,
    )
    .join("")}</Items></Root>`;

const count = (table: string) => (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
const snapshot = () => ({
  stores: count("stores"),
  products: count("products"),
  prices: count("prices"),
  fts: count("products_fts"),
  rows: sqlite.prepare("SELECT store_id, code, price, unit_price FROM prices ORDER BY store_id, code").all(),
});
// Looks a raw ItemCode up the way ingest keys it: GTINs as-is, other codes scoped to the store's chain.
const key = (store: string, code: string) => (isGtin(code) ? code : `${store.split("-")[0]}:${code}`);
const price = (store: string, code: string) =>
  (sqlite.prepare("SELECT price FROM prices WHERE store_id = ? AND code = ?").get(store, key(store, code)) as { price: number } | undefined)?.price;
const store = (id: string) => sqlite.prepare("SELECT * FROM stores WHERE id = ?").get(id) as Record<string, any> | undefined;
const ftsHits = (term: string) => (sqlite.prepare("SELECT count(*) AS n FROM products_fts WHERE products_fts MATCH ?").get(`"${term}"`) as { n: number }).n;

beforeAll(async () => {
  deps = buildDeps(loadConfig());
  sqlite = deps.db.$client;
  tmp = mkdtempSync(join(tmpdir(), "grocer-ingest-"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("idempotency", () => {
  it("re-ingesting the same Stores and PriceFull files changes no counts or rows", () => {
    const stores = storesXml(OSHER, [{ id: "1" }, { id: "2" }]);
    const p1 = pricesXml(OSHER, "1", [{ code: "I1", price: 5, name: "idem one" }, { code: "I2", price: 6, name: "idem two" }]);
    const p2 = pricesXml(OSHER, "2", [{ code: "I1", price: 4 }]);
    expect(ing.ingestStores(deps, "osher-ad", stores)).toBe(2);
    expect(ing.ingestPrices(deps, "osher-ad", p1)).toBe(2);
    expect(ing.ingestPrices(deps, "osher-ad", p2)).toBe(1);
    const first = snapshot();
    expect(first).toMatchObject({ stores: 2, prices: 3 });

    expect(ing.ingestStores(deps, "osher-ad", stores)).toBe(2);
    expect(ing.ingestPrices(deps, "osher-ad", p1)).toBe(2);
    expect(ing.ingestPrices(deps, "osher-ad", p2)).toBe(1);
    expect(snapshot()).toEqual(first);
    expect(ftsHits("idem")).toBe(2); // no duplicate FTS rows
  });

  it("the same ItemCode twice in one file leaves one row, last value wins", () => {
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, [{ id: "20" }]));
    expect(ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "20", [{ code: "DUP", price: 1 }, { code: "DUP", price: 2 }]))).toBe(1);
    expect(price(`${OSHER}-20`, "DUP")).toBe(2);
    expect(sqlite.prepare("SELECT count(*) AS n FROM prices p JOIN products USING (code) WHERE item_code = 'DUP'").get()).toEqual({ n: 1 });
  });
});

describe("price updates", () => {
  it("a changed price and unit price overwrite the row; other stores are untouched", () => {
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, [{ id: "30" }, { id: "31" }]));
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "30", [{ code: "UPD", price: 10, unitPrice: 1 }]));
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "31", [{ code: "UPD", price: 10 }]));
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "30", [{ code: "UPD", price: 12.5, unitPrice: 1.25 }]));
    expect(price(`${OSHER}-30`, "UPD")).toBe(12.5);
    expect(sqlite.prepare("SELECT unit_price FROM prices WHERE store_id = ? AND code = ?").get(`${OSHER}-30`, `${OSHER}:UPD`)).toEqual({ unit_price: 1.25 });
    expect(price(`${OSHER}-31`, "UPD")).toBe(10);
  });

  it("the first file to name a product keeps the name; later files only fill a blank manufacturer", () => {
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, [{ id: "40" }, { id: "41" }]));
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "40", [{ code: "NAMED", name: "firstname", manufacturer: "" }]));
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "41", [{ code: "NAMED", name: "secondname", manufacturer: "acme" }]));
    expect(sqlite.prepare("SELECT name, manufacturer FROM products WHERE code = ?").get(`${OSHER}:NAMED`)).toEqual({ name: "firstname", manufacturer: "acme" });
    expect(ftsHits("firstname")).toBe(1);
    expect(ftsHits("secondname")).toBe(0);
    expect(ftsHits("acme")).toBe(1);
  });

  it("skips items with a missing, non-numeric, zero or negative price, logging the count", () => {
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, [{ id: "50" }]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items: I[] = [{ code: "OK1", price: 3 }, { code: "BAD1", price: "" }, { code: "BAD2", price: "abc" }, { code: "ZERO", price: 0 }, { code: "NEG", price: -2 }];
    const n = ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "50", items));
    expect(n).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipped 2 items"));
    warn.mockRestore();
    expect(price(`${OSHER}-50`, "OK1")).toBe(3);
    for (const c of ["BAD1", "BAD2", "ZERO", "NEG"]) expect(price(`${OSHER}-50`, c)).toBeUndefined();
  });

  it("a later snapshot drops items that are no longer listed (and a price turning 0 removes the item)", () => {
    const id = `${OSHER}-51`;
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, [{ id: "51" }, { id: "52" }]));
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "52", [{ code: "SN1", price: 1 }]));
    expect(ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "51", [{ code: "SN1", price: 1 }, { code: "SN2", price: 2 }, { code: "SN3", price: 3 }]))).toBe(3);
    expect(sqlite.prepare("SELECT count(*) AS n FROM prices WHERE store_id = ?").get(id)).toEqual({ n: 3 });
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "51", [{ code: "SN1", price: 1.5 }, { code: "SN2", price: 0 }]));
    expect(sqlite.prepare("SELECT code, price FROM prices WHERE store_id = ? ORDER BY code").all(id)).toEqual([{ code: `${OSHER}:SN1`, price: 1.5 }]);
    expect(price(`${OSHER}-52`, "SN1")).toBe(1); // other stores untouched
  });

  it("zero-padded store ids in the Stores and Price files refer to the same store", () => {
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, [{ id: "060" }]));
    expect(store(`${OSHER}-60`)).toBeDefined();
    expect(ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "0060", [{ code: "PAD", price: 2 }]))).toBe(1);
    expect(price(`${OSHER}-60`, "PAD")).toBe(2);
  });
});

describe("chain validation", () => {
  it("rejects a Stores or Price file whose ChainId is not the --chain, writing nothing", () => {
    const before = snapshot();
    const storesBefore = count("stores");
    expect(() => ing.ingestStores(deps, "rami-levy", storesXml(OSHER, [{ id: "1" }]))).toThrow(/not rami-levy/);
    expect(() => ing.ingestPrices(deps, "rami-levy", pricesXml(OSHER, "1", [{ code: "I1", price: 99 }]))).toThrow(/not rami-levy/);
    expect(() => ing.ingestStores(deps, "osher-ad", storesXml("1234567890123", [{ id: "1" }]))).toThrow(/is not osher-ad/);
    expect(snapshot()).toEqual(before);
    expect(count("stores")).toBe(storesBefore);
  });

  it("rejects an unknown chain key and lists the valid ones", () => {
    expect(() => ing.ingestStores(deps, "nope", storesXml(OSHER, [{ id: "1" }]))).toThrow(/unknown chain "nope".*osher-ad/);
  });

  it("skips, without throwing, prices for a store missing from the Stores file (Shufersal lists closed stores' old files)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "9999", [{ code: "X" }]))).toBe(0);
    expect(price(`${OSHER}-9999`, "X")).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/9999 is not in the chain's Stores file/));
    warn.mockRestore();
  });

  it("skips prices for a store ingested under another chain", () => {
    ing.ingestStores(deps, "rami-levy", storesXml(RAMI, [{ id: "5" }]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "5", [{ code: "X" }]))).toBe(0);
    warn.mockRestore();
  });

  it("the file name's store wins over the StoreID inside (Carrefour file 407 says 117, another live store)", () => {
    const CARREFOUR = "7290055700007";
    ing.ingestStores(deps, "carrefour", storesXml(CARREFOUR, [{ id: "117" }, { id: "407" }]));
    ing.ingestPrices(deps, "carrefour", pricesXml(CARREFOUR, "117", [{ code: "C1", price: 5 }]), `/tmp/PriceFull${CARREFOUR}-001-117-20261101-051000.gz`);
    expect(ing.ingestPrices(deps, "carrefour", pricesXml(CARREFOUR, "117", [{ code: "C1", price: 7 }]), `PriceFull${CARREFOUR}-001-407-20261101-051000.gz`)).toBe(1);
    expect(price(`${CARREFOUR}-117`, "C1")).toBe(5);
    expect(price(`${CARREFOUR}-407`, "C1")).toBe(7);
    // 3-segment names work too; a name without a store segment falls back to the StoreID inside.
    expect(ing.ingestPrices(deps, "carrefour", pricesXml(CARREFOUR, "1", [{ code: "C2" }]), `pricefull${CARREFOUR}-0407-202611010514.gz`)).toBe(1);
    expect(price(`${CARREFOUR}-407`, "C2")).toBe(1);
    expect(ing.ingestPrices(deps, "carrefour", pricesXml(CARREFOUR, "117", [{ code: "C3" }]), "prices.gz")).toBe(1);
    expect(price(`${CARREFOUR}-117`, "C3")).toBe(1);
  });

  it("a chain with several ChainIds stores everything under the first one", () => {
    ing.ingestStores(deps, "victory", storesXml(VICTORY[1]!, [{ id: "8" }]));
    expect(store(`${VICTORY[0]}-8`)).toMatchObject({ chain_id: VICTORY[0] });
    expect(store(`${VICTORY[1]}-8`)).toBeUndefined();
    expect(ing.ingestPrices(deps, "victory", pricesXml(VICTORY[1]!, "8", [{ code: "V1", price: 2 }]))).toBe(1);
    expect(price(`${VICTORY[0]}-8`, "V1")).toBe(2);
  });

  it("garbage input throws instead of writing", () => {
    const before = snapshot();
    expect(() => ing.ingestStores(deps, "osher-ad", "not xml at all")).toThrow();
    expect(() => ing.ingestPrices(deps, "osher-ad", "")).toThrow();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(ing.ingestPrices(deps, "osher-ad", `<Root><ChainId>${OSHER}</ChainId></Root>`)).toBe(0); // no StoreId
    warn.mockRestore();
    expect(snapshot()).toEqual(before);
  });

  it("an empty Stores file ingests zero stores", () => {
    expect(ing.ingestStores(deps, "osher-ad", `<Root><ChainId>${OSHER}</ChainId><Stores></Stores></Root>`)).toBe(0);
  });
});

describe("file encodings (readXml)", () => {
  const utf16 = (xml: string, be = false) => {
    const bom = Buffer.from(be ? [0xfe, 0xff] : [0xff, 0xfe]);
    const body = Buffer.from("﻿".length ? xml : xml, "utf16le");
    if (be) body.swap16();
    return Buffer.concat([bom, body]);
  };
  const write = (name: string, data: Buffer | Uint8Array | string) => {
    const f = join(tmp, name);
    writeFileSync(f, data);
    return f;
  };

  it("ingests the UTF-16LE Stores fixture with Hebrew names intact", () => {
    expect(ing.ingestStores(deps, "osher-ad", ing.readXml(fixture("Stores7290103152017-000-20261021-080500.xml")))).toBe(4);
    // Store 1 is already in the DB from earlier tests, so only what the Chain publishes now changes (ADR 0006).
    expect(store(`${OSHER}-1`)).toMatchObject({ published_address: "הרצל 11", published_city: "אשדוד" });
  });

  it("ingests UTF-16LE and UTF-16BE Stores files written to disk", () => {
    const le = write("stores-le.xml", utf16(storesXml(OSHER, [{ id: "80", name: "שם-LE", address: "רחוב 1", city: "עיר" }])));
    const be = write("stores-be.xml", utf16(storesXml(OSHER, [{ id: "81", name: "שם-BE", address: "רחוב 2", city: "עיר" }]), true));
    expect(ing.ingestStores(deps, "osher-ad", ing.readXml(le))).toBe(1);
    expect(ing.ingestStores(deps, "osher-ad", ing.readXml(be))).toBe(1);
    expect(store(`${OSHER}-80`)).toMatchObject({ name: "שם-LE", address: "רחוב 1" });
    expect(store(`${OSHER}-81`)).toMatchObject({ name: "שם-BE", address: "רחוב 2" });
  });

  it("ingests a UTF-16LE file without a BOM", () => {
    const f = write("stores-nobom.xml", Buffer.from(storesXml(OSHER, [{ id: "82", name: "ללא BOM" }]), "utf16le"));
    expect(ing.ingestStores(deps, "osher-ad", ing.readXml(f))).toBe(1);
    expect(store(`${OSHER}-82`)?.name).toBe("ללא BOM");
  });

  it("ingests a zip named .gz, a real gzip, and a plain file", async () => {
    const { gzipSync } = await import("node:zlib");
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, [{ id: "90" }, { id: "91" }, { id: "92" }, { id: "93" }]));
    const mk = (code: string, n: number) => pricesXml(OSHER, `9${n}`, [{ code, price: 7, name: `enc ${code}` }]);
    const zipAsGz = write("PriceFull-zip.gz", Buffer.from(zipSync({ "PriceFull.xml": new TextEncoder().encode(mk("ZIP1", 0)) })));
    const gz = write("PriceFull-real.gz", gzipSync(mk("GZ1", 1)));
    const gzAsXml = write("PriceFull-gz-named.xml", gzipSync(mk("GZ2", 2)));
    const plain = write("PriceFull-plain.xml", mk("PL1", 3));
    for (const f of [zipAsGz, gz, gzAsXml, plain]) expect(ing.ingestPrices(deps, "osher-ad", ing.readXml(f))).toBe(1);
    ["ZIP1", "GZ1", "GZ2", "PL1"].forEach((c, n) => expect(price(`${OSHER}-9${n}`, c)).toBe(7));
  });

  it("an empty zip is rejected", () => {
    const f = write("empty.gz", Buffer.from(zipSync({})));
    expect(() => ing.readXml(f)).toThrow(/empty zip/);
  });

  it("ingests the shipped gz and plain price fixtures end to end", () => {
    expect(ing.ingestPrices(deps, "osher-ad", ing.readXml(fixture("PriceFull7290103152017-001-001-20261021-051600.gz")))).toBe(4);
    expect(ing.ingestPrices(deps, "osher-ad", ing.readXml(fixture("PriceFull7290103152017-001-002-20261021-051600.xml")))).toBe(2);
    expect(price(`${OSHER}-2`, "7290000000001")).toBe(5.5);
  });
});

describe("cli", () => {
  const run = (args: string[], db: string) =>
    spawnSync(process.execPath, ["src/worker.ts", "ingest-prices", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: db },
      encoding: "utf8",
    });

  it("exits 1 with usage when --chain or files are missing", () => {
    const db = join(tmp, "cli-usage.db");
    const r = run(["--chain", "osher-ad"], db);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("pass --stores");
  }, 30_000);

  it("rejects a file whose ChainId does not match --chain (non-zero exit), and loads it with the right chain", () => {
    const db = join(tmp, "cli.db");
    const stores = fixture("Stores7290103152017-000-20261021-080500.xml");
    const bad = run(["--chain", "rami-levy", "--stores", stores], db);
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/not rami-levy/);

    const good = run(["--chain", "osher-ad", "--stores", stores, "--prices", fixture("PriceFull7290103152017-001-001-20261021-051600.gz"), fixture("PriceFull7290103152017-001-002-20261021-051600.xml")], db);
    expect(good.status, good.stderr).toBe(0);
    expect(good.stdout).toContain("4 stores");
    expect(good.stdout).toContain("4 prices");
    expect(good.stdout).toContain("2 prices"); // second --prices file arrives as a positional
  }, 30_000);
});

describe("product keys", () => {
  const COLA = "4000417025005"; // real EAN-13 seen at five chains

  it("isGtin checks digits, length and the GS1 check digit", () => {
    for (const c of [COLA, "3161911229199", "96385074", "036000291452", "10900302814", "10012345678902"]) expect(isGtin(c)).toBe(true);
    for (const c of ["4000417025006", "7290000000001", "102", "1022788", "123456789", "4000417O25005", "", "400041702500500"]) expect(isGtin(c)).toBe(false);
  });

  it("keeps a GTIN global across chains and scopes an internal code to its chain", () => {
    ing.ingestStores(deps, "osher-ad", storesXml(OSHER, [{ id: "70" }]));
    ing.ingestStores(deps, "rami-levy", storesXml(RAMI, [{ id: "70" }]));
    ing.ingestPrices(deps, "osher-ad", pricesXml(OSHER, "70", [{ code: COLA, price: 12 }, { code: "102", price: 7, name: "בטטה" }]));
    ing.ingestPrices(deps, "rami-levy", pricesXml(RAMI, "70", [{ code: COLA, price: 11 }, { code: "102", price: 9, name: "עגבניות" }]));
    const rows = sqlite.prepare("SELECT code, item_code AS itemCode, name FROM products WHERE item_code IN (?, '102') ORDER BY code").all(COLA);
    expect(rows).toEqual([
      { code: COLA, itemCode: COLA, name: `item ${COLA}` },
      { code: `${RAMI}:102`, itemCode: "102", name: "עגבניות" },
      { code: `${OSHER}:102`, itemCode: "102", name: "בטטה" },
    ].sort((a, b) => (a.code < b.code ? -1 : 1)));
    expect(sqlite.prepare("SELECT count(*) AS n FROM prices WHERE code = ?").get(COLA)).toEqual({ n: 2 });
    expect(sqlite.prepare("SELECT count(*) AS n FROM prices WHERE code = ?").get(`${OSHER}:102`)).toEqual({ n: 1 });
  });

  it("re-ingesting a file with scoped and global codes changes nothing", () => {
    const xml = pricesXml(OSHER, "70", [{ code: COLA, price: 12 }, { code: "102", price: 7, name: "בטטה" }]);
    const before = snapshot();
    ing.ingestPrices(deps, "osher-ad", xml);
    ing.ingestPrices(deps, "osher-ad", xml);
    expect(snapshot()).toEqual(before);
  });
});


describe("clock", () => {
  it("ingestPrices stamps updated_at from deps.clock", () => {
    const clock = fakeClock(new Date("2026-11-01T10:00:00Z"));
    const d = { ...buildDeps(loadConfig()), clock };
    ing.ingestStores(d, "osher-ad", storesXml(OSHER, [{ id: "1" }]));
    ing.ingestPrices(d, "osher-ad", pricesXml(OSHER, "1", [{ code: "CLK1" }]));
    const at = () => d.db.$client.prepare("SELECT updated_at AS t FROM prices").get() as { t: number };
    expect(at().t).toBe(Date.parse("2026-11-01T10:00:00Z"));
    clock.advance(60_000);
    ing.ingestPrices(d, "osher-ad", pricesXml(OSHER, "1", [{ code: "CLK1" }]));
    expect(at().t).toBe(Date.parse("2026-11-01T10:01:00Z"));
  });
});
