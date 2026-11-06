import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildDeps, type Deps } from "#/deps.ts";
import { chainSeeds } from "#/ingest/chains.ts";
import { createInternalApp } from "#/internal-app.ts";
import { decodeXml } from "#/ingest/parse.ts";
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

  const STORES = `Stores${OSHER}-000-20261021-080500.xml`;
  const FULL1 = `PriceFull${OSHER}-001-001-20261021-051600.gz`;
  const FULL2 = `PriceFull${OSHER}-001-002-20261021-051600.xml`;
  /** fakePricePortal, except that downloading a name in `failing` throws. */
  const portal = (files: Record<string, Uint8Array>, ...failing: string[]) => {
    const fake = fakePricePortal(files);
    return {
      ...fake,
      async open() {
        const p = await fake.open();
        return { files: p.files, download: (f) => (failing.includes(f.name) ? Promise.reject(new Error("other side closed")) : p.download(f)) };
      },
    } satisfies PricePortal;
  };
  const osherResult = (deps: Deps, id: number) =>
    one(deps, "SELECT status, error FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?", id, OSHER);
  const storePrices = (deps: Deps, store: string) => rows(deps, "SELECT code, price FROM prices WHERE store_id = ? ORDER BY code", `${OSHER}-${store}`);

  it.each([
    ["whose download throws", (): [Uint8Array, boolean] => [osherFiles[FULL1]!, true], /other side closed/],
    ["that is not a price file", (): [Uint8Array, boolean] => [new TextEncoder().encode("<html><body>login</body></html>"), false], /not a price file/],
    ["that is a cut-off gzip", (): [Uint8Array, boolean] => [osherFiles[FULL1]!.subarray(0, 200), false], /unexpected end of file/],
  ])("a PriceFull %s is a Store failure: that store keeps its prices, later stores load, the Chain is ok", async (_, bad, logged) => {
    const deps = setup({ pricePortal: fakePricePortal({ [STORES]: osherFiles[STORES]!, [FULL1]: osherFiles[FULL1]! }) });
    await priceSyncJob(deps)({});
    const store1 = storePrices(deps, "1");
    expect(store1.length).toBeGreaterThan(0);
    expect(storePrices(deps, "2")).toEqual([]);

    const [bytes, throws] = bad();
    const files = { [STORES]: osherFiles[STORES]!, [FULL1]: bytes, [FULL2]: osherFiles[FULL2]! };
    const errors = vi.spyOn(console, "error");
    const id = await priceSyncJob({ ...deps, pricePortal: portal(files, ...(throws ? [FULL1] : [])) })({});
    const failure = errors.mock.calls.find(([m]) => String(m).includes(FULL1));
    errors.mockRestore();

    expect(osherResult(deps, id)).toEqual({ status: "ok", error: null });
    expect(storePrices(deps, "1")).toEqual(store1);
    expect(storePrices(deps, "2").length).toBeGreaterThan(0);
    expect(String(failure?.[1])).toMatch(logged);
  });

  it("a Store failure skips that store's price update file", async () => {
    const update = `Price${OSHER}-001-001-20261021-090000.xml`;
    const files = { ...osherFiles, [update]: osherFiles[FULL2]! };
    const pricePortal = portal(files, FULL1);
    await priceSyncJob(setup({ pricePortal }))({});
    expect(pricePortal.downloaded).toContain(FULL2);
    expect(pricePortal.downloaded).not.toContain(update);
  });

  it("a Chain whose every PriceFull fails is still failed", async () => {
    const deps = setup({ pricePortal: portal(osherFiles, FULL1, FULL2) });
    const id = await priceSyncJob(deps)({});
    expect(osherResult(deps, id)).toEqual({ status: "failed", error: expect.stringMatching(/no prices loaded from any of 2 PriceFull files/) });
  });

  it("a Chain whose Stores file fails is still failed", async () => {
    const deps = setup({ pricePortal: portal(osherFiles, STORES) });
    const id = await priceSyncJob(deps)({});
    expect(osherResult(deps, id)).toEqual({ status: "failed", error: "other side closed" });
    expect(one(deps, "SELECT count(*) AS n FROM prices").n).toBe(0);
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

  it("never changes a store it has seen, keeps the address the Chain publishes next to it, and adds new stores (ADR 0006)", async () => {
    const storesFile = `Stores${OSHER}-000-20261021-080500.xml`;
    const files = { ...osherFiles };
    const deps = setup({ pricePortal: fakePricePortal(files) });
    await priceSyncJob(deps)({});
    const fixed = `${OSHER}-1`;
    const store = (id: string) => one(deps, "SELECT name, address, city, lat, lng, published_address, published_city FROM stores WHERE id = ?", id);
    // A correction made on the Internal dashboard.
    deps.db.$client.prepare("UPDATE stores SET name = 'Fixed', address = 'Fixed 1', city = 'Fixedville', lat = 31.1, lng = 34.1 WHERE id = ?").run(fixed);

    // The Chain now publishes store 001 renamed and moved, and a store Grocer has not seen.
    files[storesFile] = new TextEncoder().encode(
      decodeXml(Buffer.from(osherFiles[storesFile]!))
        .replace(/(<StoreID>001<\/StoreID>.*?<StoreName>)[^<]*(<\/StoreName><Address>)[^<]*(<\/Address><City>)[^<]*/, "$1Renamed$2Moved 7$3Haifa")
        .replace("</Stores>", "<Store><StoreID>005</StoreID><StoreName>Newcomer</StoreName><Address>New 5</Address><City>Ashdod</City></Store></Stores>"),
    );
    await priceSyncJob(deps)({});

    expect(store(fixed)).toEqual({ name: "Fixed", address: "Fixed 1", city: "Fixedville", lat: 31.1, lng: 34.1, published_address: "Moved 7", published_city: "Haifa" });
    expect(store(`${OSHER}-5`)).toEqual({ name: "Newcomer", address: "New 5", city: "Ashdod", lat: 32, lng: 34, published_address: "New 5", published_city: "Ashdod" });
  });

  it("keeps a store edited on the Internal dashboard, and geocodes one whose location the edit cleared", async () => {
    const deps = buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: "t" }), {
      pricePortal: fakePricePortal(osherFiles),
      geocoder: fakeGeocoder(() => ({ lat: 32, lng: 34.8 })),
    });
    await priceSyncJob(deps)({});
    const edit = (id: string, body: Record<string, unknown>) =>
      createInternalApp(deps).request(`/stores/${id}`, {
        method: "PUT",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ name: "Fixed", address: "Fixed 1", city: "Beersheba", ...body }),
      });
    expect((await edit(`${OSHER}-1`, { lat: 31.25, lng: 34.79 })).status).toBe(200);
    expect((await edit(`${OSHER}-2`, { lat: null, lng: null })).status).toBe(200);

    await priceSyncJob(deps)({});
    const store = (id: string) => one(deps, "SELECT name, address, city, lat, lng FROM stores WHERE id = ?", id);
    expect(store(`${OSHER}-1`)).toEqual({ name: "Fixed", address: "Fixed 1", city: "Beersheba", lat: 31.25, lng: 34.79 });
    expect(store(`${OSHER}-2`)).toEqual({ name: "Fixed", address: "Fixed 1", city: "Beersheba", lat: 32, lng: 34.8 });
  });
});
