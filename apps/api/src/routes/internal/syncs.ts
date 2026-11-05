import { asc, desc, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { chains, syncChainResults, syncRuns } from "#/db/appSchema.ts";
import type { AppEnv } from "#/middleware.ts";
import { bad } from "#/routes/internal/valid.ts";

const DAY = 86_400_000;
const listQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(90) });
const idParam = z.object({ id: z.coerce.number().int().positive() });

const listed = {
  id: syncRuns.id,
  trigger: syncRuns.trigger,
  status: syncRuns.status,
  skipReason: syncRuns.skipReason,
  scheduledAt: syncRuns.scheduledAt,
  requestedAt: syncRuns.requestedAt,
  startedAt: syncRuns.startedAt,
  finishedAt: syncRuns.finishedAt,
};

/** The Internal dashboard's Price syncs, on the private app. */
export const syncsRoutes = new Hono<AppEnv>()
  // The Price syncs requested in the last `days` days (default and most 90), newest first.
  .get("/", (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return bad(c, query.error);
    const { db, clock } = c.var.deps;
    const syncs = db
      .select(listed)
      .from(syncRuns)
      .where(gte(syncRuns.requestedAt, new Date(clock.now().getTime() - query.data.days * DAY)))
      .orderBy(desc(syncRuns.requestedAt), desc(syncRuns.id))
      .all();
    return c.json({ syncs }, 200);
  })
  // One run: its per-Chain results (each Chain's own outcome and, apart, its Promotion outcome) and its Product type step.
  .get("/:id", (c) => {
    const param = idParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
    const { db } = c.var.deps;
    const run = db
      .select({ ...listed, productsTyped: syncRuns.productsTyped, productsOther: syncRuns.productsOther, typeRequestsFailed: syncRuns.typeRequestsFailed })
      .from(syncRuns)
      .where(eq(syncRuns.id, param.data.id))
      .get();
    if (!run) return c.json({ error: "not found" }, 404);
    const { productsTyped, productsOther, typeRequestsFailed, ...sync } = run;
    const results = db
      .select({
        chainId: syncChainResults.chainId,
        name: chains.name,
        nameHe: chains.nameHe,
        status: syncChainResults.status,
        error: syncChainResults.error,
        filesDownloaded: syncChainResults.filesDownloaded,
        storesLoaded: syncChainResults.storesLoaded,
        pricesLoaded: syncChainResults.pricesLoaded,
        storesGeocoded: syncChainResults.storesGeocoded,
        promotionsLoaded: syncChainResults.promotionsLoaded,
        durationMs: syncChainResults.durationMs,
        promotionStatus: syncChainResults.promotionStatus,
        promotionError: syncChainResults.promotionError,
      })
      .from(syncChainResults)
      .innerJoin(chains, eq(chains.id, syncChainResults.chainId))
      .where(eq(syncChainResults.syncRunId, sync.id))
      .orderBy(asc(chains.name))
      .all();
    // The step writes all three counts or none (null: it did not run).
    const productTypes = productsTyped == null ? null : { typed: productsTyped, other: productsOther ?? 0, failedRequests: typeRequestsFailed ?? 0 };
    return c.json({ sync: { ...sync, productTypes }, chains: results }, 200);
  });
