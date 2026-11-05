import { Hono } from "hono";
import { z } from "zod";
import { syncHistory, syncRun } from "#/db/syncs.ts";
import type { AppEnv } from "#/middleware.ts";
import { bad } from "#/routes/internal/valid.ts";

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** The Internal dashboard's Price syncs, on the private app. */
export const syncsRoutes = new Hono<AppEnv>()
  .get("/", (c) => c.json({ ...syncHistory(c.var.deps.db, c.var.deps.clock.now()), syncTimes: c.var.deps.config.SYNC_TIMES }, 200))
  .get("/:id", (c) => {
    const param = idParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
    const run = syncRun(c.var.deps.db, param.data.id);
    return run ? c.json(run, 200) : c.json({ error: "not found" }, 404);
  });
