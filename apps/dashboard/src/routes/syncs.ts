import { Hono, type Context } from "hono";
import type { AppEnv } from "#/middleware.ts";
import { layout } from "#/pages/layout.ts";
import { syncsPage, syncsSection } from "#/pages/syncs.ts";

/** The last 90 days of Price syncs from the private app. Any other answer is a bug or a bad SYNC_TOKEN: onError shows it. */
async function recentSyncs(c: Context<AppEnv>) {
  const res = await c.var.deps.api.syncs.$get();
  if (res.status !== 200) throw new Error(`api GET /syncs answered ${res.status}`);
  return (await res.json()).syncs;
}

export const syncsRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.html(layout("Price syncs", syncsPage(await recentSyncs(c)))))
  // The Manual sync button: the private app records the request (202) or answers busy (409).
  .post("/syncs", async (c) => {
    const { status } = await c.var.deps.api.sync.$post();
    if (status !== 202 && status !== 409) throw new Error(`api POST /sync answered ${String(status)}`);
    return c.html(syncsSection(await recentSyncs(c), status === 202 ? "started" : "busy"));
  });
