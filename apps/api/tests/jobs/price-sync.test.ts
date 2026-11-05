import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDeps, type Deps } from "#/deps.ts";
import { chainSeeds } from "#/ingest/chains.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";
import type { PricePortal } from "#/services/price-portal.ts";
import { fakeClock } from "#/utils/clock.ts";

const fx = (f: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../__fixtures__/${f}`, import.meta.url))));
const OSHER = "7290103152017";
// The fake serves these to every Chain; only Osher Ad's ChainId matches, so the other Chains fail with "no Stores file".
const osherFiles = {
  [`Stores${OSHER}-000-20261021-080500.xml`]: fx(`Stores${OSHER}-000-20261021-080500.xml`),
  [`PriceFull${OSHER}-001-001-20261021-051600.gz`]: fx(`PriceFull${OSHER}-001-001-20261021-051600.gz`),
  [`PriceFull${OSHER}-001-002-20261021-051600.xml`]: fx(`PriceFull${OSHER}-001-002-20261021-051600.xml`),
};

const rows = (deps: Deps, sql: string, ...params: unknown[]) => deps.db.$client.prepare(sql).all(...params) as Record<string, unknown>[];
const one = (deps: Deps, sql: string, ...params: unknown[]) => rows(deps, sql, ...params)[0]!;
const setup = (overrides: Partial<Deps> = {}) =>
  buildDeps(loadConfig(), { pricePortal: fakePricePortal(osherFiles), geocoder: fakeGeocoder(() => ({ lat: 32, lng: 34 })), ...overrides });

describe("priceSyncJob", () => {
  it("syncs every Chain and records the run and one result per Chain", async () => {
    const deps = setup();
    const id = await priceSyncJob(deps)({});

    expect(one(deps, "SELECT trigger, status FROM sync_runs WHERE id = ?", id)).toEqual({ trigger: "manual", status: "finished" });
    const results = rows(deps, "SELECT * FROM sync_chain_results WHERE sync_run_id = ?", id);
    expect(results).toHaveLength(chainSeeds.length);
    const osher = results.find((r) => r.chain_id === OSHER)!;
    const stores = one(deps, "SELECT count(*) AS n FROM stores").n;
    expect(osher).toMatchObject({ status: "ok", files_downloaded: 3, stores_loaded: stores, stores_geocoded: stores, error: null });
    expect(osher.prices_loaded).toBe(one(deps, "SELECT count(*) AS n FROM prices").n);
    expect(osher.prices_loaded).toBeGreaterThan(0);
    expect(one(deps, "SELECT count(*) AS n FROM stores WHERE lat IS NULL").n).toBe(0);
    expect(results.find((r) => r.chain_id === chainSeeds[0]!.ids[0])).toMatchObject({ status: "failed", error: expect.stringMatching(/no Stores file/) });
  });

  it("loads a PriceFull into the store its file name names, not the StoreID inside (Carrefour)", async () => {
    const renamed = {
      [`Stores${OSHER}-000-20261021-080500.xml`]: osherFiles[`Stores${OSHER}-000-20261021-080500.xml`]!,
      [`PriceFull${OSHER}-001-004-20261021-051600.gz`]: osherFiles[`PriceFull${OSHER}-001-001-20261021-051600.gz`]!,
    };
    const deps = setup({ pricePortal: fakePricePortal(renamed) });
    await priceSyncJob(deps)({});
    expect(rows(deps, "SELECT DISTINCT store_id FROM prices")).toEqual([{ store_id: `${OSHER}-4` }]);
  });

  it("fails a Chain whose every PriceFull names a store missing from its Stores file", async () => {
    const unknown = {
      [`Stores${OSHER}-000-20261021-080500.xml`]: osherFiles[`Stores${OSHER}-000-20261021-080500.xml`]!,
      [`PriceFull${OSHER}-001-998-20261021-051600.gz`]: osherFiles[`PriceFull${OSHER}-001-001-20261021-051600.gz`]!,
      [`PriceFull${OSHER}-001-999-20261021-051600.xml`]: osherFiles[`PriceFull${OSHER}-001-002-20261021-051600.xml`]!,
    };
    const deps = setup({ pricePortal: fakePricePortal(unknown) });
    const id = await priceSyncJob(deps)({});
    expect(one(deps, "SELECT * FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?", id, OSHER)).toMatchObject({
      status: "failed",
      files_downloaded: 3,
      prices_loaded: 0,
      error: expect.stringMatching(/no prices loaded from any of 2 PriceFull files/),
    });
  });

  it("refuses to start while a Price sync is running or a request is waiting, and records nothing", async () => {
    const deps = setup();
    deps.db.$client.prepare("INSERT INTO sync_runs (trigger, status, requested_at) VALUES ('scheduled', 'running', 0)").run();
    await expect(priceSyncJob(deps)({})).rejects.toThrow(/already running or requested/);
    expect(one(deps, "SELECT count(*) AS n FROM sync_runs").n).toBe(1);
    expect(one(deps, "SELECT count(*) AS n FROM sync_chain_results").n).toBe(0);
  });

  it("a Chain whose portal throws is recorded as failed and keeps its previous prices; later Chains still load", async () => {
    const deps = setup();
    await priceSyncJob(deps)({});
    const before = rows(deps, "SELECT store_id, code, price FROM prices ORDER BY store_id, code");

    const fake = fakePricePortal(osherFiles);
    const broken: PricePortal = {
      open: (chain) => (chain.key === "osher-ad" ? Promise.reject(new Error("portal down")) : fake.open()),
    };
    const errorHandler = fakeErrorHandler();
    const id = await priceSyncJob({ ...deps, pricePortal: broken, errorHandler })({});

    expect(one(deps, "SELECT status FROM sync_runs WHERE id = ?", id)).toEqual({ status: "finished" });
    const results = rows(deps, "SELECT chain_id, status, error FROM sync_chain_results WHERE sync_run_id = ?", id);
    expect(results).toHaveLength(chainSeeds.length);
    expect(results.find((r) => r.chain_id === OSHER)).toEqual({ chain_id: OSHER, status: "failed", error: "portal down" });
    expect(rows(deps, "SELECT store_id, code, price FROM prices ORDER BY store_id, code")).toEqual(before);
    expect(errorHandler.reported).toHaveLength(chainSeeds.length);
  });

  it("a failed browse refresh is reported and the sync still loads every Chain and finishes", async () => {
    const errorHandler = fakeErrorHandler();
    const deps = setup({ errorHandler });
    deps.db.$client.exec("CREATE TRIGGER browse_broken BEFORE INSERT ON browse_catalog BEGIN SELECT RAISE(ABORT, 'browse broken'); END");
    const id = await priceSyncJob(deps)({});
    expect(one(deps, "SELECT status FROM sync_runs WHERE id = ?", id)).toEqual({ status: "finished" });
    expect(one(deps, "SELECT status FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?", id, OSHER)).toEqual({ status: "ok" });
    expect(errorHandler.reported.filter((e) => e instanceof Error && e.message === "browse broken")).toHaveLength(2); // before and after the Chains
  });

  it("a geocoder error leaves stores without coordinates and does not fail the Chain", async () => {
    const deps = setup({ geocoder: fakeGeocoder(() => { throw new Error("rate limited"); }) });
    const id = await priceSyncJob(deps)({});
    expect(one(deps, "SELECT status, stores_geocoded FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?", id, OSHER)).toEqual({
      status: "ok",
      stores_geocoded: 0,
    });
    expect(one(deps, "SELECT count(*) AS n FROM stores WHERE lat IS NOT NULL").n).toBe(0);
  });

  it("an abort during a Chain lets that Chain finish, then records the sync as interrupted and runs no more Chains", async () => {
    const controller = new AbortController();
    const fake = fakePricePortal(osherFiles);
    const deps = setup({
      pricePortal: {
        open: (chain) => {
          if (chain.key === "osher-ad") controller.abort();
          return fake.open();
        },
      },
    });
    const id = await priceSyncJob(deps)({}, controller.signal);

    expect(one(deps, "SELECT status FROM sync_runs WHERE id = ?", id)).toEqual({ status: "interrupted" });
    const done = rows(deps, "SELECT chain_id FROM sync_chain_results WHERE sync_run_id = ? ORDER BY rowid", id).map((r) => r.chain_id);
    const upTo = chainSeeds.findIndex((c) => c.key === "osher-ad");
    expect(done).toEqual(chainSeeds.slice(0, upTo + 1).map((c) => c.ids[0]));
    expect(one(deps, "SELECT status FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?", id, OSHER)).toEqual({ status: "ok" });
    expect(one(deps, "SELECT count(*) AS n FROM prices").n).toBeGreaterThan(0);
  });

  it("deletes Price syncs that started more than 90 days before it, with their Chain results; newer ones stay", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const clock = fakeClock(new Date("2026-11-05T10:00:00+02:00"));
    const deps = setup({ clock });
    const old = await priceSyncJob(deps)({});
    clock.advance(DAY);
    const kept = await priceSyncJob(deps)({});
    clock.advance(90 * DAY - 1);
    const latest = await priceSyncJob(deps)({}); // 90 days after `kept` minus 1 ms, 91 days after `old`

    expect(rows(deps, "SELECT id FROM sync_runs ORDER BY id").map((r) => r.id)).toEqual([kept, latest]);
    expect(one(deps, "SELECT count(*) AS n FROM sync_chain_results WHERE sync_run_id = ?", old).n).toBe(0);
    expect(one(deps, "SELECT count(*) AS n FROM sync_chain_results WHERE sync_run_id = ?", kept).n).toBe(chainSeeds.length);
  });
});
