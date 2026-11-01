import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { syncRuns } from "#/db/appSchema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { createInternalApp } from "#/internal-app.ts";
import { loadConfig } from "#/services/config.ts";

const TOKEN = "test-sync-token";
const setup = () => buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }));
const post = (deps: Deps, auth?: string) =>
  createInternalApp(deps).request("/sync", { method: "POST", headers: auth ? { Authorization: auth } : {} });
const runs = (deps: Deps) => deps.db.$client.prepare("SELECT id, trigger, status FROM sync_runs ORDER BY id").all();

describe("POST /sync (private trigger)", () => {
  it("401 without the token or with a wrong one, recording nothing", async () => {
    const deps = setup();
    expect((await post(deps)).status).toBe(401);
    expect((await post(deps, "Bearer wrong")).status).toBe(401);
    expect((await post(deps, TOKEN)).status).toBe(401);
    expect(runs(deps)).toEqual([]);
  });

  it("202 records a Manual sync request and returns its id", async () => {
    const deps = setup();
    const res = await post(deps, `Bearer ${TOKEN}`);
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: number };
    expect(runs(deps)).toEqual([{ id, trigger: "manual", status: "requested" }]);
  });

  it("409 while a request is waiting, recording nothing", async () => {
    const deps = setup();
    await post(deps, `Bearer ${TOKEN}`);
    expect((await post(deps, `Bearer ${TOKEN}`)).status).toBe(409);
    expect(runs(deps)).toHaveLength(1);
  });

  it("409 while a Price sync is running, recording nothing", async () => {
    const deps = setup();
    deps.db.insert(syncRuns).values({ trigger: "scheduled", status: "running", requestedAt: new Date() }).run();
    expect((await post(deps, `Bearer ${TOKEN}`)).status).toBe(409);
    expect(runs(deps)).toHaveLength(1);
  });

  it("202 again once the previous sync has finished", async () => {
    const deps = setup();
    deps.db.insert(syncRuns).values({ trigger: "manual", status: "finished", requestedAt: new Date() }).run();
    expect((await post(deps, `Bearer ${TOKEN}`)).status).toBe(202);
  });

  it("is not mounted on the public app", async () => {
    const res = await createApp(setup()).request("/sync", { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(404);
  });

  it("refuses to build without SYNC_TOKEN", () => {
    expect(() => createInternalApp(buildDeps(loadConfig()))).toThrow(/SYNC_TOKEN/);
  });
});
