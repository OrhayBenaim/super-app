// The Price syncs the Internal dashboard reads: the kept runs with their Chains counted by outcome, the Chains that need
// a look, and one run's Chain results.
import { asc, desc, eq, gte, sql } from "drizzle-orm";
import { CHAIN_OUTCOMES, chainOutcome, SYNC_HISTORY, type ChainOutcome } from "@grocer/shared/sync-history";
import { chains, syncChainResults, syncRuns } from "#/db/appSchema.ts";
import type { Db } from "#/db/index.ts";

const DAY = 86_400_000;
const noOutcomes = () => Object.fromEntries(CHAIN_OUTCOMES.map((o) => [o, 0])) as Record<ChainOutcome, number>;

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

/**
 * The Price syncs requested in the last SYNC_HISTORY.days (all the Price sync keeps), newest first, each with its Chains
 * counted by outcome; `attention`: each Chain the latest run that reached it failed, with the streak of that failure.
 */
export function syncHistory(db: Db, now: Date) {
  const since = gte(syncRuns.requestedAt, new Date(now.getTime() - SYNC_HISTORY.days * DAY));
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

  const counts = new Map<number, Record<ChainOutcome, number>>();
  const streaks = new Map<string, { row: (typeof results)[number]; outcome: ChainOutcome; since: number; runs: number; open: boolean }>();
  for (const r of results) {
    const n = counts.get(r.syncId) ?? noOutcomes();
    const outcome = chainOutcome(r);
    n[outcome]++;
    counts.set(r.syncId, n);
    // Newest run first: a Chain's streak is its latest outcome and the runs before it that ended the same way.
    const streak = streaks.get(r.chainId);
    if (!streak) streaks.set(r.chainId, { row: r, outcome, since: r.due, runs: 1, open: true });
    else if (streak.open && outcome === streak.outcome) Object.assign(streak, { since: r.due, runs: streak.runs + 1 });
    else streak.open = false;
  }

  const syncs = runs.map((run) => ({ ...run, chains: counts.get(run.id) ?? noOutcomes() }));
  const attention = [...streaks.values()]
    .filter((s): s is typeof s & { outcome: Exclude<ChainOutcome, "ok"> } => s.outcome !== "ok")
    .sort((a, b) => (CHAIN_OUTCOMES.indexOf(a.outcome) - CHAIN_OUTCOMES.indexOf(b.outcome) || b.runs - a.runs || a.row.name.localeCompare(b.row.name)))
    .map(({ row, outcome, since, runs }) => ({
      chainId: row.chainId,
      name: row.name,
      nameHe: row.nameHe,
      failure: outcome,
      error: outcome === "failed" ? row.error : row.promotionError,
      syncId: row.syncId,
      since: new Date(since).toISOString(),
      runs,
    }));
  return { syncs, attention };
}

/** One run: its per-Chain results (each Chain's own outcome and, apart, its Promotion outcome) and its Product type step. Null when there is none. */
export function syncRun(db: Db, id: number) {
  const run = db
    .select({ ...listed, productsTyped: syncRuns.productsTyped, productsOther: syncRuns.productsOther, typeRequestsFailed: syncRuns.typeRequestsFailed })
    .from(syncRuns)
    .where(eq(syncRuns.id, id))
    .get();
  if (!run) return null;
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
  return { sync: { ...sync, productTypes }, chains: results };
}
