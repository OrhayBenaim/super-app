import { describe, expect, it } from "vitest";
import { stores, syncChainResults, syncRuns } from "api/src/db/appSchema.ts";
import { setup } from "../seam.ts";

const RAMI = "7290058140886";
const counts = { filesDownloaded: 1, storesLoaded: 1, pricesLoaded: 1, storesGeocoded: 0, durationMs: 1 };
const store = (storeId: string, lat: number | null) =>
  ({ id: `${RAMI}-${storeId}`, chainId: RAMI, storeId, subChainId: "1", name: "Store", address: "Herzl 1", city: "Haifa", lat, lng: lat });

describe("Chains page", () => {
  it("shows each Chain's names, stores, stores without location, last outcome and last good sync, linking to its stores", async () => {
    const { api, app } = setup();
    api.db.insert(stores).values([store("1", 32.8), store("2", null), store("3", 31.7), store("4", null), store("5", null)]).run();
    api.db
      .insert(syncRuns)
      .values([
        { trigger: "scheduled", status: "finished", requestedAt: new Date("2026-11-04T05:00:00Z"), startedAt: new Date("2026-11-04T05:00:00Z") },
        { trigger: "manual", status: "finished", requestedAt: new Date("2026-11-05T05:00:00Z"), startedAt: new Date("2026-11-05T05:00:00Z") },
      ])
      .run();
    api.db
      .insert(syncChainResults)
      .values([
        { syncRunId: 1, chainId: RAMI, status: "ok", ...counts },
        { syncRunId: 2, chainId: RAMI, status: "failed", error: "boom", ...counts },
        { syncRunId: 2, chainId: "7290027600007", status: "ok", ...counts },
      ])
      .run();

    const res = await app.request("/chains");
    expect(res.status).toBe(200);
    const html = await res.text();
    const rami = html.slice(html.indexOf("Rami Levy"), html.indexOf("</tr>", html.indexOf("Rami Levy")));
    expect(rami).toContain("רמי לוי");
    expect(rami).toContain('class="badge badge-failed"');
    expect(rami).toContain("4 Nov 2026, 07:00"); // the good run's start, in Israel time
    expect(rami).toContain("<td>5</td>");
    expect(rami).toContain("<td>3</td>");
    expect(html).toContain(`href="/stores?chain=${RAMI}"`);
    const shufersal = html.slice(html.indexOf("Shufersal"), html.indexOf("</tr>", html.indexOf("Shufersal")));
    expect(shufersal).toContain('class="badge badge-ok"');
    const yohananof = html.slice(html.indexOf("Yohananof"), html.indexOf("</tr>", html.indexOf("Yohananof")));
    expect(yohananof).toContain("No Price sync yet");
  });

  it("is linked from every page's navigation", async () => {
    const { app } = setup();
    expect(await (await app.request("/")).text()).toContain('href="/chains"');
  });
});
