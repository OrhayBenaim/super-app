// Full-size real downloads (untrusted, uncommitted, 2026-11-01): the dialects the truncated fixtures cannot show.
// Skipped when the directory is absent.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { buildDeps } from "#/deps.ts";
import { chainSeeds } from "#/ingest/chains.ts";
import * as ing from "#/ingest/ingest.ts";
import { isGtin, parsePrices, parseStores } from "#/ingest/parse.ts";
import { loadConfig } from "#/services/config.ts";

const BASE = process.env.PRICEFILES_DIR ?? "/tmp/claude-0/-home-user-super-app/cff31717-d49f-58da-bb1d-3db6de0c654c/scratchpad/pricefiles";
const files = (key: string) => (existsSync(join(BASE, key)) ? readdirSync(join(BASE, key)).map((n) => join(BASE, key, n)) : []);
const storesOf = (key: string) => files(key).find((f) => /\/Stores/.test(f))!;
const priceOf = (key: string, re: RegExp) => files(key).find((f) => re.test(f))!;
const present = ["dor-alon", "keshet", "shufersal"].every((k) => files(k).length);

describe.skipIf(!present)("full real downloads", () => {
  let sqlite: Database;
  let deps: ReturnType<typeof buildDeps>;

  beforeAll(async () => {
    deps = buildDeps(loadConfig());
    sqlite = deps.db.$client;
  });

  const stores = (key: string) => parseStores(ing.readXml(storesOf(key))).stores;

  it("Dor Alon: 157 stores in 5 sub-chains, ids unique across them", () => {
    const s = stores("dor-alon");
    expect(s).toHaveLength(157);
    expect(new Set(s.map((x) => x.subChainId))).toEqual(new Set(["1", "2", "3", "4", "5"]));
    expect(new Set(s.map((x) => x.storeId)).size).toBe(157);
  });

  it("Shufersal: <Chain> root, 418 stores in 11 sub-chains, UTF-8 gzip", () => {
    const s = stores("shufersal");
    expect(s).toHaveLength(418);
    expect(new Set(s.map((x) => x.subChainId)).size).toBe(11);
  });

  it("every Stores file: no '0', placeholder, entity or CR left in name/address/city; some codes decode to names", () => {
    for (const c of chainSeeds) {
      if (!files(c.key).length) continue;
      const s = stores(c.key);
      expect(s.length, c.key).toBeGreaterThan(0);
      for (const x of s) {
        expect(x.city, c.key).not.toBe("0");
        for (const v of [x.name, x.address, x.city]) expect(v, `${c.key} ${JSON.stringify(x)}`).not.toMatch(/&#|\r|^(לא ידוע|unknown)$/i);
      }
    }
    expect(stores("dor-alon").filter((x) => x.city === "תל אביב").length).toBeGreaterThan(5);
  });

  it("Keshet store 2 (second dialect): 158 zero-priced items skipped, repeated ItemCodes keep the last row, ',' manufacturer is null", () => {
    const file = priceOf("keshet", /-002-\d{12}\.gz$/);
    const parsed = parsePrices(ing.readXml(file));
    expect(parsed.items).toHaveLength(11065);
    ing.ingestStores(deps, "keshet", ing.readXml(storesOf("keshet")));
    const n = ing.ingestPrices(deps, "keshet", ing.readXml(file));
    const positive = parsed.items.filter((i) => i.price > 0);
    expect(parsed.items.length - positive.length).toBe(158);
    const last = new Map(positive.map((i) => [i.code, i]));
    expect(n).toBe(last.size);
    expect(last.size).toBeLessThan(positive.length); // at least one repeated code
    const row = sqlite.prepare("SELECT price FROM prices WHERE store_id = ? AND code = ?");
    for (const [code, it] of last) expect(row.get("7290785400000-2", isGtin(code) ? code : `7290785400000:${code}`), code).toEqual({ price: it.price });
    expect(sqlite.prepare("SELECT count(*) AS n FROM products WHERE manufacturer IN (',', '---', '.')").get()).toEqual({ n: 0 });
  }, 30_000);

  it("Shufersal store 1: 11-digit UPCs stay global, no '---' manufacturer", () => {
    ing.ingestStores(deps, "shufersal", ing.readXml(storesOf("shufersal")));
    const file = priceOf("shufersal", /-001-001-/);
    const n = ing.ingestPrices(deps, "shufersal", ing.readXml(file));
    expect(n).toBe(6542);
    expect(sqlite.prepare("SELECT count(*) AS n FROM products WHERE code NOT LIKE '%:%' AND length(code) = 11").get()).not.toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT count(*) AS n FROM products WHERE manufacturer = '---'").get()).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT count(*) AS n FROM prices WHERE store_id LIKE '7290027600007-%' AND code LIKE '%:%' AND code NOT LIKE '7290027600007:%'").get()).toEqual({ n: 0 });
  }, 30_000);
});
