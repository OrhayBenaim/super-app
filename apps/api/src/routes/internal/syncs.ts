import { desc, gte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { syncRuns } from "#/db/appSchema.ts";
import type { AppEnv } from "#/middleware.ts";

const DAY = 86_400_000;
const listQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(90) });

/** The Internal dashboard's Price syncs, on the private app. */
export const syncsRoutes = new Hono<AppEnv>()
  // The Price syncs requested in the last `days` days (default and most 90), newest first.
  .get("/", (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: query.error.issues[0]?.message ?? "invalid query" }, 400);
    const { db, clock } = c.var.deps;
    const syncs = db
      .select({
        id: syncRuns.id,
        trigger: syncRuns.trigger,
        status: syncRuns.status,
        skipReason: syncRuns.skipReason,
        scheduledAt: syncRuns.scheduledAt,
        requestedAt: syncRuns.requestedAt,
        startedAt: syncRuns.startedAt,
        finishedAt: syncRuns.finishedAt,
      })
      .from(syncRuns)
      .where(gte(syncRuns.requestedAt, new Date(clock.now().getTime() - query.data.days * DAY)))
      .orderBy(desc(syncRuns.requestedAt), desc(syncRuns.id))
      .all();
    return c.json({ syncs }, 200);
  });
