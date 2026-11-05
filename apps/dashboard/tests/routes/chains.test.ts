import { describe, expect, it } from "vitest";
import { stores, syncChainResults, syncRuns } from "api/src/db/appSchema.ts";
import { setup } from "../seam.ts";

const RAMI = "7290058140886";
const SHUFERSAL = "7290027600007";
const VICTORY = "7290696200003";
const counts = { filesDownloaded: 1, storesLoaded: 1, pricesLoaded: 1, storesGeocoded: 0, durationMs: 1 };
const store = (storeId: string, lat: number | null) =>
  ({ id: `${RAMI}-${storeId}`, chainId: RAMI, storeId, subChainId: "1", name: "Store", address: "Herzl 1", city: "Haifa", lat, lng: lat });
const NOW = new Date("2026-11-05T10:00:00Z");

/** The page's rows in order, each with the error row under it. */
const rows = (html: string) => html.slice(html.indexOf("<tbody>")).split("<tr").slice(1);
const rowOf = (html: string, name: string) => rows(html).find((r) => r.includes(name))!;

function seeded() {
  const s = setup({ now: NOW });
  s.api.db.insert(stores).values([store("1", 32.8), store("2", null), store("3", 31.7), store("4", null), store("5", null)]).run();
  s.api.db
    .insert(syncRuns)
    .values([
      { trigger: "scheduled", status: "finished", requestedAt: new Date("2026-11-01T18:00:00Z"), startedAt: new Date("2026-11-01T18:00:00Z") },
      { trigger: "manual", status: "finished", requestedAt: new Date("2026-11-05T04:00:00Z"), startedAt: new Date("2026-11-05T04:00:00Z") },
    ])
    .run();
  s.api.db
    .insert(syncChainResults)
    .values([
      { syncRunId: 1, chainId: RAMI, status: "ok", ...counts },
      { syncRunId: 2, chainId: RAMI, status: "failed", error: "No Stores file among 0 listed files", ...counts },
      { syncRunId: 2, chainId: SHUFERSAL, status: "ok", ...counts },
      { syncRunId: 2, chainId: VICTORY, status: "ok", promotionStatus: "failed", promotionError: "no promo file", ...counts },
    ])
    .run();
  return s;
}

describe("Chains page", () => {
  it("leads with how many Chains there are, how many fail and how many stores have no location", async () => {
    const { app } = seeded();
    const res = await app.request("/chains");
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/<p>\d+ Chains · 1 failing · 3 stores without a location<\/p>/);
  });

  it("lists failing Chains first, each with its error under it, then Promotion failures, then the rest by name", async () => {
    const { app } = seeded();
    const html = await (await app.request("/chains")).text();
    const names = rows(html).filter((r) => !r.startsWith(' class="error')).map((r) => r.match(/<td>([^<]+) <span lang="he"/)?.[1]);
    expect(names.slice(0, 2)).toEqual(["Rami Levy", "Victory"]);
    expect(names.indexOf("Shufersal")).toBeGreaterThan(1);
    const rami = rowOf(html, "Rami Levy");
    expect(rami).toContain('class="has-error"');
    expect(rami).toContain(badgeOf("failed", "Failed"));
    expect(rows(html)[1]).toContain("No Stores file among 0 listed files");
    expect(rowOf(html, "Victory")).toContain(badgeOf("warning", "Promotion failure"));
    expect(rowOf(html, "Shufersal")).toContain(badgeOf("ok", "Ok"));
    expect(rowOf(html, "Yohananof")).toContain("No Price sync yet");
  });

  it("shows each Chain's last good sync, its stores, those with no location in amber, and a link to its stores", async () => {
    const { app } = seeded();
    const html = await (await app.request("/chains")).text();
    const rami = rowOf(html, "Rami Levy");
    expect(rami).toContain("רמי לוי");
    expect(rami).toContain("Nov 1, 20:00"); // the good run's start, in Israel time
    expect(rami).toContain('<td class="num">5</td>');
    expect(rami).toContain('<td class="num warn">3</td>');
    expect(rami).toContain(`<a href="/stores?chain=${RAMI}">Stores</a>`);
    expect(rowOf(html, "Shufersal")).toContain("Today 06:00");
    const yohananof = rowOf(html, "Yohananof");
    expect(yohananof).toContain("Never");
    expect(yohananof).toContain('<td class="num muted">0</td>');
    expect(yohananof).not.toContain("/stores?chain="); // no stores to list
  });

  it("is linked from every page's navigation, and marks itself current", async () => {
    const { app } = setup();
    expect(await (await app.request("/")).text()).toContain('href="/chains"');
    expect(await (await app.request("/chains")).text()).toContain('<a href="/chains" aria-current="page">');
  });
});

const badgeOf = (kind: string, text: string) => `<span class="badge badge-${kind}">${text}</span>`;
