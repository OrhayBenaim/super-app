import { describe, expect, it } from "vitest";
import { syncRuns } from "api/src/db/appSchema.ts";
import { fakeClock } from "api/src/utils/clock.ts";
import { post, setup, TOKEN } from "../seam.ts";

const NOW = new Date("2026-11-05T10:00:00Z"); // 12:00 in Israel
const MIN = 60_000;
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * MIN);
const seeded = () => setup({ api: { clock: fakeClock(NOW) } });
const apiSyncs = async (privateApp: ReturnType<typeof setup>["privateApp"]) =>
  ((await (await privateApp.request("/syncs", { headers: { Authorization: `Bearer ${TOKEN}` } })).json()) as { syncs: { trigger: string; status: string }[] })
    .syncs;

describe("Price sync history page", () => {
  it("shows each Price sync with its trigger, a badge per status, the skip reason, times and duration", async () => {
    const { api, app } = seeded();
    api.db
      .insert(syncRuns)
      .values([
        { trigger: "scheduled", status: "finished", scheduledAt: at(600), requestedAt: at(600), startedAt: at(600), finishedAt: at(600 - 4.2) },
        { trigger: "scheduled", status: "interrupted", requestedAt: at(500), startedAt: at(500), finishedAt: at(380) },
        { trigger: "scheduled", status: "skipped", skipReason: "manual_sync", scheduledAt: at(400), requestedAt: at(400) },
        { trigger: "scheduled", status: "skipped", skipReason: "sync_running", scheduledAt: at(300), requestedAt: at(300) },
        { trigger: "manual", status: "ignored", requestedAt: at(200) },
        { trigger: "manual", status: "running", requestedAt: at(5), startedAt: at(4) },
        { trigger: "manual", status: "requested", requestedAt: at(0) },
      ])
      .run();

    const res = await app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const status of ["requested", "running", "finished", "interrupted", "skipped", "ignored"])
      expect(html).toContain(`class="badge badge-${status}"`);
    expect(html).toContain("Scheduled");
    expect(html).toContain("Manual");
    expect(html).toContain("A Manual sync finished");
    expect(html).toContain("A Price sync was running");
    expect(html).toContain("5 Nov 2026, 02:00"); // the finished run's start, in Israel time
    expect(html).toContain("4m 12s");
    expect(html).toContain("2h 0m"); // the interrupted run
    // Newest first
    expect(html.indexOf("badge badge-requested")).toBeLessThan(html.indexOf("badge badge-finished"));
  });

  it("gives each Price sync state, Chain outcome and Promotion state its own badge style", async () => {
    const { app } = seeded();
    const html = await (await app.request("/")).text();
    const style = (cls: string) => html.match(new RegExp(`\\.badge-${cls} \\{([^}]*)\\}`))?.[1];
    const families = [
      ["requested", "running", "finished", "interrupted", "skipped", "ignored"],
      ["outcome-ok", "outcome-failed"],
      ["promo-running", "promo-notToday", "promo-future", "promo-ended"],
    ];
    for (const family of families) {
      const styles = family.map(style);
      for (const [i, s] of styles.entries()) expect(s, family[i]).toBeTruthy();
      expect(new Set(styles).size).toBe(family.length);
    }
    // An interrupted sync is not a failure
    expect(style("interrupted")).not.toBe(style("outcome-failed"));
  });

  it("says so when there are no Price syncs yet", async () => {
    const { app } = seeded();
    expect(await (await app.request("/")).text()).toContain("No Price syncs in the last 90 days");
  });
});

describe("Manual sync button", () => {
  it("requests a Manual sync and shows it in the history", async () => {
    const { app, privateApp } = seeded();
    const res = await app.request("/syncs", post());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Manual sync requested");
    expect(html).toContain('class="badge badge-requested"');
    expect(await apiSyncs(privateApp)).toMatchObject([{ trigger: "manual", status: "requested" }]);
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
