import { asc, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { SYNC_HISTORY } from "@grocer/shared/sync-history";
import { chains, syncChainResults, syncRuns } from "#/db/appSchema.ts";
import type { AppEnv } from "#/middleware.ts";
import { bad } from "#/routes/internal/valid.ts";

const DAY = 86_400_000;
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

type Failure = "chain" | "promotion";
const failureOf = (r: { status: "ok" | "failed"; promotionStatus: "ok" | "failed" | null }): Failure | null =>
  r.status === "failed" ? "chain" : r.promotionStatus === "failed" ? "promotion" : null;

/** The Internal dashboard's Price syncs, on the private app. */
export const syncsRoutes = new Hono<AppEnv>()
  // The Price syncs requested in the last SYNC_HISTORY.days (all the Price sync keeps), newest first, each with its Chains
  // counted by outcome; `attention`: each Chain the latest run that reached it failed, with the streak of that failure.
  .get("/", (c) => {
    const { db, clock, config } = c.var.deps;
    const since = gte(syncRuns.requestedAt, new Date(clock.now().getTime() - SYNC_HISTORY.days * DAY));
    const runs = db.select(listed).from(syncRuns).where(since).orderBy(desc(syncRuns.requestedAt), desc(syncRuns.id)).all();
    const results = db
      .select({
        syncId: syncRuns.id,
        due: sql<number>`coalesce(${syncRuns.scheduledAt}, ${syncRuns.requestedAt})`,
        chainId: syncChainResults.chainId,
        name: chains.name,
        nameHe: chains.nameHe,
        status: syncChainResults.status,
        error: syncChainResults.error,
        promotionStatus: syncChainResults.promotionStatus,
        promotionError: syncChainResults.promotionError,
      })
      .from(syncChainResults)
      .innerJoin(syncRuns, eq(syncRuns.id, syncChainResults.syncRunId))
      .innerJoin(chains, eq(chains.id, syncChainResults.chainId))
      .where(since)
      .orderBy(desc(syncRuns.id))
      .all();

    const counts = new Map<number, { ok: number; failed: number; promotionFailed: number }>();
    const streaks = new Map<string, { row: (typeof results)[number]; failure: Failure | null; since: number; runs: number; open: boolean }>();
    for (const r of results) {
      const n = counts.get(r.syncId) ?? { ok: 0, failed: 0, promotionFailed: 0 };
      const failure = failureOf(r);
      n[failure === "chain" ? "failed" : failure === "promotion" ? "promotionFailed" : "ok"]++;
      counts.set(r.syncId, n);
      // Newest run first: a Chain's streak is its latest failure and the runs before it that failed it the same way.
      const streak = streaks.get(r.chainId);
      if (!streak) streaks.set(r.chainId, { row: r, failure, since: r.due, runs: 1, open: true });
      else if (streak.open && failure === streak.failure) Object.assign(streak, { since: r.due, runs: streak.runs + 1 });
      else streak.open = false;
    }

    const syncs = runs.map((run) => ({ ...run, chains: counts.get(run.id) ?? { ok: 0, failed: 0, promotionFailed: 0 } }));
    const attention = [...streaks.values()]
      .filter((s): s is typeof s & { failure: Failure } => s.failure !== null)
      .sort((a, b) => (a.failure === b.failure ? b.runs - a.runs || a.row.name.localeCompare(b.row.name) : a.failure === "chain" ? -1 : 1))
      .map(({ row, failure, since, runs }) => ({
        chainId: row.chainId,
        name: row.name,
        nameHe: row.nameHe,
        failure,
        error: failure === "chain" ? row.error : row.promotionError,
        syncId: row.syncId,
        since: new Date(since).toISOString(),
        runs,
      }));
    return c.json({ syncs, attention, syncTimes: config.SYNC_TIMES }, 200);
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
