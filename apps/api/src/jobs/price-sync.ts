import { eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { syncChainResults, syncRuns } from "#/db/appSchema.ts";
import type { Deps } from "#/deps.ts";
import { syncChain, type ChainCounts } from "#/ingest/chain-sync.ts";
import { chainSeeds } from "#/ingest/chains.ts";
import { typeProducts } from "#/ingest/product-types.ts";
import { refreshBrowse } from "#/prices/browse-groups.ts";

const HISTORY_MS = 90 * 24 * 60 * 60 * 1000;

export const priceSyncData = z.object({ maxStores: z.coerce.number().int().min(1).optional() });
export type PriceSyncData = z.input<typeof priceSyncData>;

/**
 * Runs the recorded Price sync `runId` over every Chain, one after another, recording each Chain's result. A Chain failure
 * is logged, reported and recorded, and the next Chain still runs. `signal` is checked between Chains, never inside one:
 * once it fires the sync stops and is recorded as interrupted. After the Chains, gives untyped Products a Product type
 * (skipped when interrupted). Brings browse's copy up to date before the Chains (a deploy may have changed its rules) and
 * after the Product types; a failure there is logged and reported, and leaves browse as it was. Marks the run `running`
 * before its first await, and deletes Price syncs (with their Chain results) from more than 90 days before it.
 */
export async function runPriceSync(deps: Deps, runId: number, { signal, maxStores = Infinity }: { signal?: AbortSignal; maxStores?: number }) {
  const { db, clock } = deps;
  const now = clock.now();
  db.update(syncRuns).set({ status: "running", startedAt: now }).where(eq(syncRuns.id, runId)).run();
  // requestedAt, not startedAt: Skipped syncs and ignored requests never start. Chain results go by ON DELETE CASCADE.
  db.delete(syncRuns).where(lt(syncRuns.requestedAt, new Date(now.getTime() - HISTORY_MS))).run();
  let interrupted = false;
  await refreshBrowseOrReport(deps);
  for (const chain of chainSeeds) {
    if (signal?.aborted) {
      interrupted = true;
      break;
    }
    const counts: ChainCounts = {
      filesDownloaded: 0, storesLoaded: 0, pricesLoaded: 0, storesGeocoded: 0, promotionsLoaded: 0, promotionStatus: null, promotionError: null,
    };
    const start = performance.now();
    let error: string | null = null;
    try {
      await syncChain(deps, chain, maxStores, counts);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error(`price sync ${runId}: ${chain.key} failed`, e);
      deps.errorHandler.report(e);
    }
    const durationMs = Math.round(performance.now() - start);
    db.insert(syncChainResults)
      .values({ syncRunId: runId, chainId: chain.ids[0]!, status: error ? "failed" : "ok", durationMs, error, ...counts })
      .run();
    console.log(`price sync ${runId}: ${chain.key} ${error ? "failed" : "ok"} in ${durationMs} ms`, counts);
  }
  const typed = interrupted ? null : await typeProducts(deps, signal);
  await refreshBrowseOrReport(deps);
  db.update(syncRuns)
    .set({ status: interrupted || signal?.aborted ? "interrupted" : "finished", finishedAt: clock.now(), ...typed })
    .where(eq(syncRuns.id, runId))
    .run();
}

/** refreshBrowse, logging and reporting a failure: it must not leave the run `running`, which blocks every later sync. */
async function refreshBrowseOrReport({ db, errorHandler }: Deps) {
  try {
    await refreshBrowse(db);
  } catch (e) {
    console.error("price sync: browse refresh failed", e);
    errorHandler.report(e);
  }
}

/**
 * Records a Manual sync request, unless a Price sync is running or a request is already waiting: then records nothing and
 * returns null. Only one Price sync runs at a time.
 */
export function requestManualSync({ db, clock }: Pick<Deps, "db" | "clock">) {
  const busy = db.select({ id: syncRuns.id }).from(syncRuns).where(inArray(syncRuns.status, ["requested", "running"])).get();
  if (busy) return null;
  return db
    .insert(syncRuns)
    .values({ trigger: "manual", status: "requested", requestedAt: clock.now() })
    .returning({ id: syncRuns.id })
    .get().id;
}

/** `npm run sync`: records a Manual sync and runs it now. Returns the sync run id. */
export function priceSyncJob(deps: Deps) {
  return async (data: PriceSyncData, signal?: AbortSignal) => {
    const { maxStores } = priceSyncData.parse(data);
    const id = requestManualSync(deps);
    if (id === null) throw new Error("a Price sync is already running or requested; not starting another");
    await runPriceSync(deps, id, { signal, maxStores });
    return id;
  };
}
