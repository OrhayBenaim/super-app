import { Hono, type Context } from "hono";
import { z } from "zod";
import { unexpected } from "#/api-client.ts";
import type { AppEnv } from "#/middleware.ts";
import { layout } from "#/pages/layout.ts";
import { syncRunPage } from "#/pages/sync-run.ts";
import { syncsPage, syncsSection } from "#/pages/syncs.ts";

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** The kept Price syncs (SYNC_HISTORY) from the private app. Any other answer is a bug or a bad SYNC_TOKEN: onError shows it. */
async function recentSyncs(c: Context<AppEnv>) {
  const res = await c.var.deps.api.syncs.$get();
  if (res.status !== 200) throw unexpected(res, "GET /syncs");
  return (await res.json()).syncs;
}

export const syncsRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.html(layout("Price syncs", syncsPage(await recentSyncs(c)))))
  // The Manual sync button: the private app records the request (202) or answers busy (409).
  .post("/syncs", async (c) => {
    const res = await c.var.deps.api.sync.$post();
    if (res.status !== 202 && res.status !== 409) throw unexpected(res, "POST /sync");
    return c.html(syncsSection(await recentSyncs(c), res.status === 202 ? "started" : "busy"));
  })
  // One run's detail. An id that is not one, or no such run, is a page that does not exist.
  .get("/syncs/:id", async (c) => {
    const param = idParam.safeParse(c.req.param());
    if (!param.success) return c.notFound();
    const res = await c.var.deps.api.syncs[":id"].$get({ param: { id: String(param.data.id) } });
    if (res.status === 404) return c.notFound();
    if (res.status !== 200) throw unexpected(res, "GET /syncs/:id");
    const run = await res.json();
    return c.html(layout(`Price sync #${run.sync.id}`, syncRunPage(run)));
  });
