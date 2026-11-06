import { describe, expect, it } from "vitest";
import { syncChainResults, syncRuns } from "api/src/db/appSchema.ts";
import { post, setup, TOKEN } from "../seam.ts";

const NOW = new Date("2026-11-05T10:00:00Z"); // 12:00 in Israel; the api's default SYNC_TIMES are 07:00, 12:30, 20:30
const MIN = 60_000;
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * MIN);
const seeded = () => setup({ now: NOW });
const SHUFERSAL = "7290027600007";
const RAMI_LEVY = "7290058140886";
const VICTORY = "7290696200003";
const result = (syncRunId: number, chainId: string, over: Partial<typeof syncChainResults.$inferInsert> = {}) => ({
  syncRunId,
  chainId,
  status: "ok" as const,
  filesDownloaded: 1,
  storesLoaded: 1,
  pricesLoaded: 1,
  storesGeocoded: 0,
  durationMs: 1000,
  ...over,
});
const apiSyncs = async (privateApp: ReturnType<typeof setup>["privateApp"]) =>
  ((await (await privateApp.request("/syncs", { headers: { Authorization: `Bearer ${TOKEN}` } })).json()) as { syncs: { trigger: string; status: string }[] })
    .syncs;
const rowOf = (html: string, href: string) => {
  const start = html.indexOf(`<td><a href="${href}"`);
  return html.slice(start, html.indexOf("</tr>", start));
};

describe("Price syncs home: History", () => {
  it("shows each Price sync: Due, trigger, a badge per status, duration and its Chains by outcome, newest first", async () => {
    const { api, app } = seeded();
    api.db
      .insert(syncRuns)
      .values([
        // 1: today 06:00 Israel, 41 min, with a Chain failure and a Promotion failure
        { trigger: "scheduled", status: "finished", scheduledAt: at(360), requestedAt: at(360), startedAt: at(360), finishedAt: at(319) },
        // 2: yesterday 20:00 Israel, interrupted after 2 h
        { trigger: "scheduled", status: "interrupted", scheduledAt: at(960), requestedAt: at(960), startedAt: at(960), finishedAt: at(840) },
        { trigger: "scheduled", status: "skipped", skipReason: "manual_sync", scheduledAt: at(400), requestedAt: at(400) },
        { trigger: "scheduled", status: "skipped", skipReason: "sync_running", scheduledAt: at(300), requestedAt: at(300) },
        { trigger: "manual", status: "ignored", requestedAt: at(200) },
        { trigger: "manual", status: "running", requestedAt: at(13), startedAt: at(12) },
      ])
      .run();
    api.db
      .insert(syncChainResults)
      .values([
        result(1, SHUFERSAL, { status: "failed", error: "portal 503" }),
        result(1, RAMI_LEVY, { promotionStatus: "failed", promotionError: "bad promo file" }),
        result(1, VICTORY),
        result(6, VICTORY),
      ])
      .run();

    const res = await app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("6 in the last 90 days");
    const finished = rowOf(html, "/syncs/1");
    expect(finished).toContain("Today 06:00");
    expect(finished).toContain("Scheduled");
    expect(finished).toContain('<span class="badge badge-finished">Finished</span>'); // with failures: never green
    expect(finished).toContain("41 min");
    expect(finished).toMatch(/1 ok.*1 failed.*1 Promotion failure/s);
    expect(rowOf(html, "/syncs/2")).toContain("Yesterday 20:00");
    expect(rowOf(html, "/syncs/2")).toContain('<span class="badge badge-interrupted">Interrupted</span>');
    expect(rowOf(html, "/syncs/2")).toContain("2 h 0 min");
    expect(rowOf(html, "/syncs/3")).toContain("A Manual sync had just finished");
    expect(rowOf(html, "/syncs/4")).toContain("A Price sync was running");
    expect(rowOf(html, "/syncs/5")).toContain('<span class="badge badge-ignored">Ignored</span>');
    const running = rowOf(html, "/syncs/6");
    expect(running).toContain('<span class="badge badge-running">Running</span>');
    expect(running).toContain("12 min so far");
    expect(running).toContain("1 Chain done");
    expect(html.indexOf('<td><a href="/syncs/6"')).toBeLessThan(html.indexOf('<td><a href="/syncs/1"'));
  });

  it("says so when there are no Price syncs yet", async () => {
    const html = await (await seeded().app.request("/")).text();
    expect(html).toContain("No Price syncs in the last 90 days");
    expect(html).toContain("Next Scheduled sync at 12:30");
  });
});

describe("Price syncs home: the 90-day strip", () => {
  it("draws one tick per run, coloured by its worst Chain outcome, each opening its run", async () => {
    const { api, app } = seeded();
    const run = (minutesAgo: number, status: "finished" | "interrupted" | "skipped" | "requested") => ({
      trigger: "scheduled" as const,
      status,
      scheduledAt: at(minutesAgo),
      requestedAt: at(minutesAgo),
      ...(status === "finished" || status === "interrupted" ? { startedAt: at(minutesAgo), finishedAt: at(minutesAgo - 30) } : {}),
    });
    api.db.insert(syncRuns).values([run(5000, "finished"), run(4000, "finished"), run(3000, "finished"), run(2000, "interrupted"), run(1000, "skipped"), run(1, "requested")]).run();
    api.db.insert(syncChainResults).values([result(1, VICTORY), result(2, VICTORY, { status: "failed", error: "x" }), result(3, VICTORY, { promotionStatus: "failed" }), result(4, VICTORY)]).run();

    const html = await (await app.request("/")).text();
    const ticks = [...html.matchAll(/<a class="tick tick-(\w+)" href="\/syncs\/(\d+)"/g)].map((m) => [m[2], m[1]]);
    expect(ticks).toEqual([
      ["1", "ok"],
      ["2", "failed"],
      ["3", "warning"],
      ["4", "warning"], // interrupted
      ["5", "skipped"],
    ]);
    expect(html).toContain("Now");
  });
});

describe("Price syncs home: Needs attention", () => {
  it("lists each failing Chain from its latest run: outcome first, the raw error, since when and how many runs, opening the run", async () => {
    const { api, app } = seeded();
    const run = (minutesAgo: number) => ({
      trigger: "scheduled" as const,
      status: "finished" as const,
      scheduledAt: at(minutesAgo),
      requestedAt: at(minutesAgo),
      startedAt: at(minutesAgo),
      finishedAt: at(minutesAgo - 30),
    });
    // 1: 3 Nov 06:00, 2: 4 Nov 06:00, 3: today 06:00 (Israel)
    api.db.insert(syncRuns).values([run(360 + 2 * 1440), run(360 + 1440), run(360)]).run();
    api.db
      .insert(syncChainResults)
      .values([
        result(1, SHUFERSAL),
        result(2, SHUFERSAL, { status: "failed", error: "portal 503" }),
        result(3, SHUFERSAL, { status: "failed", error: "No Stores file among 0 listed files" }),
        result(3, VICTORY, { promotionStatus: "failed", promotionError: "PromoFull files timed out after 30 s" }),
      ])
      .run();

    const html = await (await app.request("/")).text();
    const attention = html.slice(html.indexOf("Needs attention"), html.indexOf("History"));
    expect(attention).toMatch(/href="\/syncs\/3"[\s\S]*Chain failure[\s\S]*Shufersal[\s\S]*Prices not updated[\s\S]*No Stores file among 0 listed files[\s\S]*Since Nov 4 · 2 runs/);
    expect(attention).toMatch(/Promotion failure[\s\S]*Victory[\s\S]*Prices updated, Promotions not loaded[\s\S]*PromoFull files timed out after 30 s[\s\S]*Today 06:00/);
    expect(attention.indexOf("Shufersal")).toBeLessThan(attention.indexOf("Victory"));
    expect(html).toContain("Shufersal has failed in every run since Nov 4");
  });

  it("is not shown when every Chain's latest run was ok", async () => {
    const { api, app } = seeded();
    api.db.insert(syncRuns).values({ trigger: "manual", status: "finished", requestedAt: at(60), startedAt: at(60), finishedAt: at(30) }).run();
    api.db.insert(syncChainResults).values(result(1, VICTORY)).run();
    const html = await (await app.request("/")).text();
    expect(html).not.toContain("Needs attention");
    expect(html).not.toContain("has failed in every run");
  });
});

describe("Manual sync button", () => {
  it("requests a Manual sync and then shows it, the button disabled with its reason", async () => {
    const { app, privateApp } = seeded();
    expect(await (await app.request("/")).text()).toMatch(/<button type="button" class="button button-filled" hx-post="\/syncs"[^>]*>Start a Manual sync<\/button>/);
    const res = await app.request("/syncs", post());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Manual sync requested");
    expect(html).toContain('<span class="badge badge-requested">Requested</span>');
    expect(html).toMatch(/<button type="button" class="button" disabled[^>]*>Start a Manual sync<\/button>\s*<span class="reason"[^>]*>One starts within a minute<\/span>/);
    expect(await apiSyncs(privateApp)).toMatchObject([{ trigger: "manual", status: "requested" }]);
  });

  it("is disabled while a Price sync runs, and the summary says which", async () => {
    const { api, app } = seeded();
    api.db.insert(syncRuns).values({ trigger: "manual", status: "running", requestedAt: at(3), startedAt: at(3) }).run();
    const html = await (await app.request("/")).text();
    expect(html).toMatch(/disabled[^>]*>Start a Manual sync<\/button>\s*<span class="reason"[^>]*>One is running now<\/span>/);
    expect(html).toContain("A Manual sync is running · next Scheduled sync at 12:30");
  });

  it("says a Price sync is already running instead of starting one", async () => {
    const { api, app, privateApp } = seeded();
    api.db.insert(syncRuns).values({ trigger: "scheduled", status: "running", requestedAt: at(3), startedAt: at(3) }).run();
    const html = await (await app.request("/syncs", post())).text();
    expect(html).toContain("A Price sync is already running");
    expect(await apiSyncs(privateApp)).toHaveLength(1);
  });

  it("refuses a cross-site form post", async () => {
    const { app, privateApp } = seeded();
    const res = await app.request("/syncs", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(403);
    expect(await apiSyncs(privateApp)).toEqual([]);
  });
});

describe("api errors", () => {
  it("answers 500 when the api refuses the dashboard's token", async () => {
    const { app } = setup({ token: "wrong" });
    expect((await app.request("/")).status).toBe(500);
  });
});
