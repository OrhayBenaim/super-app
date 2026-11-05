import { describe, expect, it } from "vitest";
import { syncChainResults, syncRuns } from "#/db/appSchema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { createInternalApp } from "#/internal-app.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const TOKEN = "test-sync-token";
const NOW = new Date("2026-11-05T10:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const setup = () => buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }), { clock: fakeClock(NOW) });
const get = (deps: Deps, path: string, auth = `Bearer ${TOKEN}`) =>
  createInternalApp(deps).request(path, { headers: { Authorization: auth } });

describe("GET /syncs (private)", () => {
  it("lists the Price syncs of the last 90 days, newest first", async () => {
    const deps = setup();
    deps.db
      .insert(syncRuns)
      .values([
        { trigger: "scheduled", status: "finished", requestedAt: ago(91), startedAt: ago(91), finishedAt: ago(91) },
        { trigger: "scheduled", status: "skipped", skipReason: "manual_sync", scheduledAt: ago(2), requestedAt: ago(2) },
        {
          trigger: "manual",
          status: "finished",
          requestedAt: ago(3),
          startedAt: ago(3),
          finishedAt: new Date(ago(3).getTime() + 60_000),
        },
        { trigger: "manual", status: "requested", requestedAt: NOW },
      ])
      .run();

    const res = await get(deps, "/syncs");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      syncs: [
        { id: 4, trigger: "manual", status: "requested", skipReason: null, scheduledAt: null, requestedAt: "2026-11-05T10:00:00.000Z", startedAt: null, finishedAt: null },
        {
          id: 2,
          trigger: "scheduled",
          status: "skipped",
          skipReason: "manual_sync",
          scheduledAt: "2026-11-03T10:00:00.000Z",
          requestedAt: "2026-11-03T10:00:00.000Z",
          startedAt: null,
          finishedAt: null,
        },
        {
          id: 3,
          trigger: "manual",
          status: "finished",
          skipReason: null,
          scheduledAt: null,
          requestedAt: "2026-11-02T10:00:00.000Z",
          startedAt: "2026-11-02T10:00:00.000Z",
          finishedAt: "2026-11-02T10:01:00.000Z",
        },
      ],
    });
  });

  it("narrows to fewer days with ?days", async () => {
    const deps = setup();
    deps.db
      .insert(syncRuns)
      .values([
        { trigger: "manual", status: "finished", requestedAt: ago(8) },
        { trigger: "manual", status: "finished", requestedAt: ago(6) },
      ])
      .run();
    const { syncs } = (await (await get(deps, "/syncs?days=7")).json()) as { syncs: { id: number }[] };
    expect(syncs.map((s) => s.id)).toEqual([2]);
  });

  it("400 for days outside 1 to 90 or not a number", async () => {
    const deps = setup();
    for (const days of ["0", "91", "abc", "1.5"]) expect((await get(deps, `/syncs?days=${days}`)).status).toBe(400);
  });

  it("401 without the token or with a wrong one", async () => {
    const deps = setup();
    expect((await createInternalApp(deps).request("/syncs")).status).toBe(401);
    expect((await get(deps, "/syncs", "Bearer wrong")).status).toBe(401);
  });
});

describe("GET /syncs/:id (private)", () => {
  const SHUFERSAL = "7290027600007";
  const RAMI_LEVY = "7290058140886";

  it("returns one run with its per-Chain results, Promotion outcome and Product type step", async () => {
    const deps = setup();
    deps.db
      .insert(syncRuns)
      .values({
        trigger: "scheduled",
        status: "finished",
        scheduledAt: ago(1),
        requestedAt: ago(1),
        startedAt: ago(1),
        finishedAt: new Date(ago(1).getTime() + 60_000),
        productsTyped: 40,
        productsOther: 3,
        typeRequestsFailed: 1,
      })
      .run();
    deps.db
      .insert(syncChainResults)
      .values([
        { syncRunId: 1, chainId: SHUFERSAL, status: "failed", filesDownloaded: 0, storesLoaded: 0, pricesLoaded: 0, storesGeocoded: 0, durationMs: 1200, error: "portal 503" },
        {
          syncRunId: 1,
          chainId: RAMI_LEVY,
          status: "ok",
          filesDownloaded: 12,
          storesLoaded: 6,
          pricesLoaded: 9000,
          storesGeocoded: 2,
          durationMs: 45_000,
          promotionsLoaded: 0,
          promotionStatus: "failed",
          promotionError: "bad promo file",
        },
      ])
      .run();

    const res = await get(deps, "/syncs/1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sync: {
        id: 1,
        trigger: "scheduled",
        status: "finished",
        skipReason: null,
        scheduledAt: "2026-11-04T10:00:00.000Z",
        requestedAt: "2026-11-04T10:00:00.000Z",
        startedAt: "2026-11-04T10:00:00.000Z",
        finishedAt: "2026-11-04T10:01:00.000Z",
        productTypes: { typed: 40, other: 3, failedRequests: 1 },
      },
      chains: [
        {
          chainId: RAMI_LEVY,
          name: "Rami Levy",
          nameHe: "רמי לוי",
          status: "ok",
          error: null,
          filesDownloaded: 12,
          storesLoaded: 6,
          pricesLoaded: 9000,
          storesGeocoded: 2,
          promotionsLoaded: 0,
          durationMs: 45_000,
          promotionStatus: "failed",
          promotionError: "bad promo file",
        },
        {
          chainId: SHUFERSAL,
          name: "Shufersal",
          nameHe: "שופרסל",
          status: "failed",
          error: "portal 503",
          filesDownloaded: 0,
          storesLoaded: 0,
          pricesLoaded: 0,
          storesGeocoded: 0,
          promotionsLoaded: 0,
          durationMs: 1200,
          promotionStatus: null,
          promotionError: null,
        },
      ],
    });
  });

  it("has no Product type step when it did not run", async () => {
    const deps = setup();
    deps.db.insert(syncRuns).values({ trigger: "manual", status: "interrupted", requestedAt: ago(1), startedAt: ago(1) }).run();
    expect(await (await get(deps, "/syncs/1")).json()).toMatchObject({ sync: { status: "interrupted", productTypes: null }, chains: [] });
  });

  it("404 for a run that does not exist", async () => {
    expect((await get(setup(), "/syncs/7")).status).toBe(404);
  });

  it("400 for an id that is not a positive whole number", async () => {
    const deps = setup();
    for (const id of ["abc", "0", "-1", "1.5"]) expect((await get(deps, `/syncs/${id}`)).status).toBe(400);
  });

  it("401 without the token", async () => {
    expect((await createInternalApp(setup()).request("/syncs/1")).status).toBe(401);
  });
});
