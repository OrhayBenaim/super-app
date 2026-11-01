// The worker's once-a-minute check (CONTEXT.md "Prices"): called directly with a fake clock, asserting only on rows.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { syncRuns } from "#/db/appSchema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { priceSyncCheck } from "#/jobs/price-sync.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";
import type { PricePortal } from "#/services/price-portal.ts";
import { fakeClock } from "#/utils/clock.ts";

const OSHER = "7290103152017";
const name = `Stores${OSHER}-000-20261021-080500.xml`;
const osherFiles = { [name]: new Uint8Array(readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)))) };

const MIN = 60_000;
const HOUR = 60 * MIN;

function setup(start: string, { env = {}, pricePortal }: { env?: Record<string, string>; pricePortal?: PricePortal } = {}) {
  const clock = fakeClock(new Date(start));
  const deps = buildDeps(loadConfig({ ...process.env, ...env }), {
    clock,
    pricePortal: pricePortal ?? fakePricePortal(osherFiles),
    geocoder: fakeGeocoder(),
  });
  return { deps, clock };
}

type Run = { id: number; trigger: string; status: string; skip_reason: string | null; scheduled_at: number | null };
const runs = (deps: Deps) =>
  deps.db.$client.prepare("SELECT id, trigger, status, skip_reason, scheduled_at FROM sync_runs ORDER BY id").all() as Run[];
const at = (iso: string) => new Date(iso).getTime();

describe("priceSyncCheck: Scheduled syncs", () => {
  it("runs a Scheduled sync at 05:00, 12:00 and 23:30 Asia/Jerusalem and does nothing between them", async () => {
    // 2026-11-02 is winter time, UTC+2.
    const { deps, clock } = setup("2026-11-02T02:00:00Z");
    const check = priceSyncCheck(deps);
    for (let i = 0; i < 24 * 60; i++) {
      clock.advance(MIN);
      await check();
    }
    expect(runs(deps).map((r) => [r.trigger, r.status, r.scheduled_at])).toEqual([
      ["scheduled", "finished", at("2026-11-02T03:00:00Z")],
      ["scheduled", "finished", at("2026-11-02T10:00:00Z")],
      ["scheduled", "finished", at("2026-11-02T21:30:00Z")],
    ]);
  });

  it.each([
    ["summer time (UTC+3)", "2026-07-01T02:00:00Z"],
    ["the day summer time ends (2026-10-25)", "2026-10-25T03:00:00Z"],
    ["the day summer time starts (2027-03-26)", "2027-03-26T02:00:00Z"],
  ])("uses local time on %s", async (_, fiveAm) => {
    const { deps, clock } = setup(new Date(at(fiveAm) - HOUR - MIN).toISOString());
    const check = priceSyncCheck(deps);
    clock.advance(HOUR); // up to 04:59 local, and to 05:00 of the wrong offset
    await check();
    expect(runs(deps)).toEqual([]);
    clock.advance(MIN);
    await check();
    expect(runs(deps).map((r) => r.scheduled_at)).toEqual([at(fiveAm)]);
  });

  it("reads the times from SYNC_TIMES", async () => {
    const { deps, clock } = setup("2026-11-02T06:59:00Z", { env: { SYNC_TIMES: "09:00" } });
    const check = priceSyncCheck(deps);
    clock.advance(MIN);
    await check();
    expect(runs(deps).map((r) => r.scheduled_at)).toEqual([at("2026-11-02T07:00:00Z")]);
  });

  it("does not make up a scheduled time missed while the worker was down", async () => {
    const { deps, clock } = setup("2026-11-02T02:59:00Z");
    priceSyncCheck(deps); // the worker starts at 04:59 and dies
    clock.advance(10 * MIN);
    await priceSyncCheck(deps)(); // restarted at 05:09
    expect(runs(deps)).toEqual([]);
  });

  it("records a scheduled time that comes while a sync is running as skipped with reason sync_running", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((r) => (release = r));
    const fake = fakePricePortal(osherFiles);
    const { deps, clock } = setup("2026-11-02T02:59:00Z", {
      env: { SYNC_TIMES: "05:00,05:01" },
      pricePortal: { open: async () => (await blocked, fake.open()) },
    });
    const check = priceSyncCheck(deps);
    clock.advance(MIN);
    const first = check(); // 05:00 starts a sync that waits on the portal
    clock.advance(MIN);
    await check(); // 05:01
    release();
    await first;
    expect(runs(deps).map((r) => [r.status, r.skip_reason, r.scheduled_at])).toEqual([
      ["finished", null, at("2026-11-02T03:00:00Z")],
      ["skipped", "sync_running", at("2026-11-02T03:01:00Z")],
    ]);
  });

  it("on startup marks a sync left running as interrupted", () => {
    const { deps } = setup("2026-11-02T02:59:00Z");
    deps.db.insert(syncRuns).values({ trigger: "scheduled", status: "running", requestedAt: new Date(0), startedAt: new Date(0) }).run();
    priceSyncCheck(deps);
    expect(runs(deps).map((r) => r.status)).toEqual(["interrupted"]);
  });
});

describe("priceSyncCheck: Manual syncs", () => {
  const request = (deps: Deps) =>
    deps.db.insert(syncRuns).values({ trigger: "manual", status: "requested", requestedAt: deps.clock.now() }).returning().get().id;

  it("runs a waiting Manual sync request on the next check", async () => {
    const { deps, clock } = setup("2026-11-02T06:00:00Z");
    const check = priceSyncCheck(deps);
    const id = request(deps);
    clock.advance(MIN);
    await check();
    expect(runs(deps)).toEqual([{ id, trigger: "manual", status: "finished", skip_reason: null, scheduled_at: null }]);
    const results = deps.db.$client.prepare("SELECT status FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?").get(id, OSHER);
    expect(results).toEqual({ status: "ok" });
  });

  it("two racing requests produce exactly one sync, the other is ignored", async () => {
    const { deps } = setup("2026-11-02T06:00:00Z");
    const check = priceSyncCheck(deps);
    const a = request(deps);
    const b = request(deps);
    await Promise.all([check(), check()]);
    expect(runs(deps).map((r) => [r.id, r.status])).toEqual([
      [a, "finished"],
      [b, "ignored"],
    ]);
  });

  it("a finished Manual sync, even with Chain failures, skips the next scheduled time with reason manual_sync", async () => {
    const { deps, clock } = setup("2026-11-02T03:30:00Z"); // 05:30, after the 05:00 sync
    const check = priceSyncCheck(deps);
    request(deps);
    await check(); // the fake fails every Chain but Osher Ad
    expect(deps.db.$client.prepare("SELECT count(*) AS n FROM sync_chain_results WHERE status = 'failed'").get()).toEqual({ n: 14 });
    clock.advance(6 * 60 * MIN + 30 * MIN); // 12:00
    await check();
    clock.advance(11 * 60 * MIN + 30 * MIN); // 23:30
    await check();
    expect(runs(deps).map((r) => [r.trigger, r.status, r.skip_reason, r.scheduled_at])).toEqual([
      ["manual", "finished", null, null],
      ["scheduled", "skipped", "manual_sync", at("2026-11-02T10:00:00Z")],
      ["scheduled", "finished", null, at("2026-11-02T21:30:00Z")],
    ]);
  });

  it("an Interrupted Manual sync skips nothing", async () => {
    const controller = new AbortController();
    const fake = fakePricePortal(osherFiles);
    const { deps, clock } = setup("2026-11-02T09:00:00Z", {
      pricePortal: { open: async () => (controller.abort(), fake.open()) },
    });
    const check = priceSyncCheck(deps, controller.signal);
    request(deps);
    await check();
    clock.advance(HOUR - MIN); // 11:59: the worker restarts after the deploy
    const restarted = priceSyncCheck({ ...deps, pricePortal: fakePricePortal(osherFiles) });
    clock.advance(MIN); // 12:00
    await restarted();
    expect(runs(deps).map((r) => [r.trigger, r.status, r.skip_reason])).toEqual([
      ["manual", "interrupted", null],
      ["scheduled", "finished", null],
    ]);
  });
});
