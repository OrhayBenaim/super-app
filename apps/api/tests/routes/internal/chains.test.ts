import { describe, expect, it } from "vitest";
import { stores, syncChainResults, syncRuns } from "#/db/appSchema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { chainSeeds } from "#/ingest/chains.ts";
import { createInternalApp } from "#/internal-app.ts";
import { loadConfig } from "#/services/config.ts";

const TOKEN = "test-sync-token";
const RAMI = "7290058140886";
const setup = () => buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }));
const get = (deps: Deps, path: string, auth = `Bearer ${TOKEN}`) =>
  createInternalApp(deps).request(path, { headers: { Authorization: auth } });
const counts = { filesDownloaded: 1, storesLoaded: 1, pricesLoaded: 1, storesGeocoded: 0, durationMs: 1 };
const store = (storeId: string, lat: number | null) =>
  ({ id: `${RAMI}-${storeId}`, chainId: RAMI, storeId, subChainId: "1", name: "Store", address: "Herzl 1", city: "Haifa", lat, lng: lat });

type Chain = { id: string; lastStatus: string | null };

describe("GET /chains (private)", () => {
  it("returns every Chain with its names, stores, stores without location, last outcome and last good sync", async () => {
    const deps = setup();
    deps.db.insert(stores).values([store("1", 32.8), store("2", null), store("3", null)]).run();
    deps.db
      .insert(syncRuns)
      .values([
        { trigger: "scheduled", status: "finished", requestedAt: new Date("2026-11-03T05:00:00Z"), startedAt: new Date("2026-11-03T05:00:00Z") },
        { trigger: "scheduled", status: "finished", requestedAt: new Date("2026-11-04T05:00:00Z"), startedAt: new Date("2026-11-04T05:00:00Z") },
        { trigger: "manual", status: "finished", requestedAt: new Date("2026-11-05T05:00:00Z"), startedAt: new Date("2026-11-05T05:00:00Z") },
      ])
      .run();
    // Rami Levy was good on the 4th and failed on the 5th; the run on the 5th has no result for Shufersal.
    deps.db
      .insert(syncChainResults)
      .values([
        { syncRunId: 1, chainId: RAMI, status: "ok", ...counts },
        { syncRunId: 2, chainId: RAMI, status: "ok", ...counts },
        { syncRunId: 3, chainId: RAMI, status: "failed", error: "boom", ...counts },
        { syncRunId: 2, chainId: "7290027600007", status: "ok", ...counts },
      ])
      .run();

    const res = await get(deps, "/chains");
    expect(res.status).toBe(200);
    const { chains } = (await res.json()) as { chains: Chain[] };
    expect(chains).toHaveLength(chainSeeds.length);
    expect(chains.find((c) => c.id === RAMI)).toEqual({
      id: RAMI,
      key: "rami-levy",
      name: "Rami Levy",
      nameHe: "רמי לוי",
      stores: 3,
      storesWithoutLocation: 2,
      lastStatus: "failed",
      lastGoodSyncAt: "2026-11-04T05:00:00.000Z",
    });
    expect(chains.find((c) => c.id === "7290027600007")).toMatchObject({ stores: 0, lastStatus: "ok", lastGoodSyncAt: "2026-11-04T05:00:00.000Z" });
    expect(chains.find((c) => c.id === "7290803800003")).toEqual({
      id: "7290803800003",
      key: "yohananof",
      name: "Yohananof",
      nameHe: "יוחננוף",
      stores: 0,
      storesWithoutLocation: 0,
      lastStatus: null,
      lastGoodSyncAt: null,
    });
  });

  it("401 without the token or with a wrong one", async () => {
    const deps = setup();
    expect((await createInternalApp(deps).request("/chains")).status).toBe(401);
    expect((await get(deps, "/chains", "Bearer wrong")).status).toBe(401);
  });
});
