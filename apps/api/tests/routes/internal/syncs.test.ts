import { describe, expect, it } from "vitest";
import { syncRuns } from "#/db/appSchema.ts";
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
