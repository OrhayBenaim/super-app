// End to end on real downloads: Yohananof Stores + 2 PriceFull files through the real CLI into a file DB, then asserted
// with better-sqlite3 and POST /api/compare. Skipped when the (untrusted, uncommitted) download directory is absent.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { app as App } from "../app.js";
import { decodeXml, isGtin, parsePrices } from "./parse.js";

const DIR = process.env.YOHANANOF_DIR ?? "/tmp/claude-0/-home-user-super-app/cff31717-d49f-58da-bb1d-3db6de0c654c/scratchpad/verify/yohananof";
const present = existsSync(DIR);
const CHAIN = "7290803800003";
const names = present ? readdirSync(DIR) : [];
const storesFile = names.find((n) => /^Stores/.test(n)) ?? "";
const priceFiles = names.filter((n) => /^PriceFull/.test(n)).sort().slice(0, 2);

describe.skipIf(!present || !storesFile || priceFiles.length < 2)("real Yohananof files, CLI to compare", () => {
  let tmp: string;
  let db: Database.Database;
  let app: typeof App;
  let cookie: string;
  const here = { lat: 32.0853, lng: 34.7818 };
  const parsed = priceFiles.map((f) => parsePrices(decodeXml(readFileSync(join(DIR, f)))));
  const storeIds = parsed.map((p) => `${CHAIN}-${p.storeId}`);
  // Last row wins, as ingest does for a repeated ItemCode.
  const parsedPrices = (i: number) => new Map(parsed[i]!.items.map((it) => [isGtin(it.code) ? it.code : `${CHAIN}:${it.code}`, it.price]));

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "grocer-e2e-"));
    const dbPath = join(tmp, "e2e.db");
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/ingest/cli.ts", "--chain", "yohananof", "--stores", join(DIR, storesFile), "--prices", ...priceFiles.map((f) => join(DIR, f))],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: dbPath }, encoding: "utf8" },
    );
    expect(r.status, r.stderr).toBe(0);
    db = new Database(dbPath);
    process.env.DATABASE_URL = dbPath;
    process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
  }, 30_000);

  afterAll(() => {
    db?.close();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  const n = (sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { n: number }).n;

  it("loads 51 stores and >20k prices, none <= 0, every price code has a product", () => {
    expect(n("SELECT count(*) AS n FROM stores")).toBe(51);
    expect(n("SELECT count(*) AS n FROM prices")).toBeGreaterThan(20_000);
    expect(n("SELECT count(*) AS n FROM prices WHERE price <= 0 OR price IS NULL OR price != price")).toBe(0);
    expect(n("SELECT count(*) AS n FROM prices pr LEFT JOIN products p ON p.code = pr.code WHERE p.code IS NULL")).toBe(0);
    expect(n("SELECT count(*) AS n FROM prices pr LEFT JOIN stores s ON s.id = pr.store_id WHERE s.id IS NULL")).toBe(0);
  });

  it("scoped (non-GTIN) codes are 3-10% of prices and every scoped code carries the Yohananof ChainId and a raw item_code", () => {
    const share = n("SELECT count(*) AS n FROM prices WHERE code LIKE '%:%'") / n("SELECT count(*) AS n FROM prices");
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.1);
    expect(n("SELECT count(*) AS n FROM products WHERE code LIKE '%:%' AND code != ? || ':' || item_code", CHAIN)).toBe(0);
    expect(n("SELECT count(*) AS n FROM products WHERE code NOT LIKE '%:%' AND code != item_code")).toBe(0);
  });

  it("cleans the data: City 0 -> '', no placeholder or bare-punctuation manufacturer, no literal entities", () => {
    expect(n("SELECT count(*) AS n FROM stores WHERE city != ''")).toBe(0);
    expect(n("SELECT count(*) AS n FROM stores WHERE address LIKE '%&#%' OR address LIKE '%' || char(13) || '%'")).toBe(0);
    expect(n("SELECT count(*) AS n FROM products WHERE manufacturer IN ('לא ידוע', 'Unknown', 'unknown', ',', '---')")).toBe(0);
    expect(n("SELECT count(*) AS n FROM products WHERE unit_qty IS NOT NULL AND unit_qty NOT GLOB '*[^ ]*'")).toBe(0);
  });

  it("re-ingesting a PriceFull in-process changes nothing", async () => {
    const before = db.prepare("SELECT store_id, code, price FROM prices ORDER BY 1, 2").all();
    const { ingestPrices, readXml } = await import("./ingest.js");
    expect(ingestPrices("yohananof", readXml(join(DIR, priceFiles[0]!)))).toBe(parsedPrices(0).size);
    expect(db.prepare("SELECT store_id, code, price FROM prices ORDER BY 1, 2").all()).toEqual(before);
  }, 20_000);

  it("POST /api/compare returns both stores with correct totals for 3 real GTINs", async () => {
    ({ app } = await import("../app.js"));
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "e2e@yohananof.test", password: "password1234", name: "E2E" }),
    });
    cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

    // Two stores get coordinates by SQL (geocoding needs the network).
    const set = db.prepare("UPDATE stores SET lat = ?, lng = ? WHERE id = ?");
    set.run(here.lat + 0.009, here.lng, storeIds[0]); // ~1 km
    set.run(here.lat + 0.045, here.lng, storeIds[1]); // ~5 km
    // Pick GTINs both stores carry, spread across the sorted list, from the files (not the DB), so the expectation is independent.
    const [a, b] = [parsedPrices(0), parsedPrices(1)];
    const common = [...a.keys()].filter((c) => b.has(c) && isGtin(c)).sort();
    expect(common.length).toBeGreaterThan(100);
    const codes = [common[0]!, common[Math.floor(common.length / 2)]!, common.at(-1)!];
    const missing = "7290000000000X";

    const post = await app.request("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ ...here, codes: [...codes, missing], sort: "distance" }),
    });
    expect(post.status).toBe(200);
    const body = (await post.json()) as { stores: any[]; unmatched: string[] };
    expect(body.stores.map((s) => s.storeId)).toEqual(storeIds);
    expect(body.unmatched).toEqual([missing]);
    const round2 = (x: number) => Math.round(x * 100) / 100;
    [a, b].forEach((prices, i) => {
      const s = body.stores[i];
      expect(s).toMatchObject({ chainId: CHAIN, matched: 3, missingCodes: [missing] });
      expect(s.total).toBe(round2(codes.reduce((sum, c) => sum + prices.get(c)!, 0)));
      expect(Object.fromEntries(s.items.map((it: any) => [it.code, it.price]))).toEqual(Object.fromEntries(codes.map((c) => [c, prices.get(c)])));
    });
    expect(body.stores[0].distanceKm).toBeLessThan(body.stores[1].distanceKm);
  }, 20_000);
});
