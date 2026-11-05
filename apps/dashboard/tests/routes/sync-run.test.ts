import { describe, expect, it } from "vitest";
import { syncChainResults, syncRuns } from "api/src/db/appSchema.ts";
import { setup } from "../seam.ts";

const NOW = new Date("2026-11-05T10:00:00Z"); // 12:00 in Israel
const MIN = 60_000;
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * MIN);
const seeded = () => setup({ now: NOW });
const SHUFERSAL = "7290027600007";
const RAMI_LEVY = "7290058140886";
const VICTORY = "7290696200003";
const result = (chainId: string, over: Partial<typeof syncChainResults.$inferInsert> = {}) => ({
  syncRunId: 1,
  chainId,
  status: "ok" as const,
  filesDownloaded: 12,
  storesLoaded: 6,
  pricesLoaded: 9_000,
  storesGeocoded: 2,
  durationMs: 157_000,
  ...over,
});

describe("Price sync run page", () => {
  it("shows the run, its Product type step and its Chains, failures first with their errors under them", async () => {
    const { api, app } = seeded();
    // Today 06:00 to 06:41 Israel
    api.db
      .insert(syncRuns)
      .values({ trigger: "scheduled", status: "finished", scheduledAt: at(360), requestedAt: at(360), startedAt: at(360), finishedAt: at(319), productsTyped: 1_204, productsOther: 96, typeRequestsFailed: 0 })
      .run();
    api.db
      .insert(syncChainResults)
      .values([
        result(VICTORY),
        result(SHUFERSAL, { status: "failed", filesDownloaded: 0, storesLoaded: 0, pricesLoaded: 0, storesGeocoded: 0, durationMs: 400, error: "No Stores file among 0 listed files" }),
        result(RAMI_LEVY, { promotionStatus: "failed", promotionError: "PromoFull files timed out after 30 s" }),
      ])
      .run();

    const res = await app.request("/syncs/1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<a class="breadcrumb" href="/">Price syncs</a>');
    expect(html).toContain("<h1>Today 06:00</h1>");
    expect(html).toContain("Scheduled · 06:00 – 06:41 · 41 min · 2 of 3 Chains updated");
    expect(html).toContain('<span class="badge badge-finished">Finished</span>');
    expect(html).toMatch(/<strong>1,204<\/strong> Products given a type[\s\S]*<strong>96<\/strong> typed as Other[\s\S]*<strong>0<\/strong> failed requests/);
    // Failures first: the Chain failure, then the Promotion failure, then the rest
    const order = ["Shufersal", "Rami Levy", "Victory"].map((n) => html.indexOf(`<td>${n}</td>`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toMatch(/Shufersal[\s\S]*badge badge-failed">Failed<[\s\S]*class="error"><td colspan="8">No Stores file among 0 listed files/);
    expect(html).toMatch(/Rami Levy[\s\S]*badge badge-ok">Ok<[\s\S]*badge badge-warning">Promotion failure<[\s\S]*class="error warning"><td colspan="8">Promotions not loaded: PromoFull files timed out after 30 s/);
    expect(html).toContain("9,000");
    expect(html).toContain("2 min 37 s");
    expect(html).toContain("0.4 s");
  });

  it("says when the Product type step did not run", async () => {
    const { api, app } = seeded();
    api.db.insert(syncRuns).values({ trigger: "manual", status: "interrupted", requestedAt: at(9), startedAt: at(9), finishedAt: at(1) }).run();
    const html = await (await app.request("/syncs/1")).text();
    expect(html).toContain('<span class="badge badge-interrupted">Interrupted</span>');
    expect(html).toContain("The Product type step did not run");
    expect(html).toContain("No Chain results for this Price sync");
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
