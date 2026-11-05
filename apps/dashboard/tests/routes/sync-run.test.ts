import { describe, expect, it } from "vitest";
import { syncChainResults, syncRuns } from "api/src/db/appSchema.ts";
import { fakeClock } from "api/src/utils/clock.ts";
import { setup } from "../seam.ts";

const NOW = new Date("2026-11-05T10:00:00Z");
const MIN = 60_000;
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * MIN);
const seeded = () => setup({ api: { clock: fakeClock(NOW) } });
const SHUFERSAL = "7290027600007";
const RAMI_LEVY = "7290058140886";

describe("Price sync run page", () => {
  it("shows a Chain failure and a Promotion failure as distinct states with their errors", async () => {
    const { api, app } = seeded();
    api.db
      .insert(syncRuns)
      .values({ trigger: "scheduled", status: "finished", requestedAt: at(60), startedAt: at(60), finishedAt: at(50), productsTyped: 40, productsOther: 3, typeRequestsFailed: 1 })
      .run();
    api.db
      .insert(syncChainResults)
      .values([
        { syncRunId: 1, chainId: SHUFERSAL, status: "failed", filesDownloaded: 0, storesLoaded: 0, pricesLoaded: 0, storesGeocoded: 0, durationMs: 1_200, error: "portal answered 503" },
        {
          syncRunId: 1,
          chainId: RAMI_LEVY,
          status: "ok",
          filesDownloaded: 12,
          storesLoaded: 6,
          pricesLoaded: 9_000,
          storesGeocoded: 2,
          durationMs: 252_000,
          promotionsLoaded: 0,
          promotionStatus: "failed",
          promotionError: "promo file did not parse",
        },
      ])
      .run();

    const res = await app.request("/syncs/1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Shufersal");
    expect(html).toContain("רמי לוי");
    expect(html).toContain('<span class="badge badge-failed">Chain failure</span>');
    expect(html).toContain("portal answered 503");
    expect(html).toContain('<span class="badge badge-failed">Promotion failure</span>');
    expect(html).toContain("promo file did not parse");
    expect(html).toContain('<span class="badge badge-ok">ok</span>'); // Rami Levy's own outcome, apart from its Promotions
    expect(html).toContain("9,000");
    expect(html).toContain("4m 12s");
    expect(html).toContain("40 Products typed, 3 as Other, 1 failed request");
  });

  it("says when the Product type step did not run", async () => {
    const { api, app } = seeded();
    api.db.insert(syncRuns).values({ trigger: "manual", status: "interrupted", requestedAt: at(9), startedAt: at(9), finishedAt: at(1) }).run();
    const html = await (await app.request("/syncs/1")).text();
    expect(html).toContain('class="badge badge-interrupted"');
    expect(html).toContain("The Product type step did not run");
  });

  it("is linked from the history", async () => {
    const { api, app } = seeded();
    api.db.insert(syncRuns).values({ trigger: "manual", status: "finished", requestedAt: at(9), startedAt: at(9), finishedAt: at(1) }).run();
    expect(await (await app.request("/")).text()).toContain('href="/syncs/1"');
  });

  it("404 for a run that does not exist or an id that is not one", async () => {
    const { app } = seeded();
    for (const id of ["7", "abc", "0"]) expect((await app.request(`/syncs/${id}`)).status).toBe(404);
  });
});
