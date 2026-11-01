import { setTimeout as sleep } from "node:timers/promises";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { syncChainResults, syncRuns } from "#/db/appSchema.ts";
import type { Deps } from "#/deps.ts";
import { syncChain, type ChainCounts } from "#/ingest/chain-sync.ts";
import { chainSeeds } from "#/ingest/chains.ts";

export const priceSyncData = z.object({ maxStores: z.coerce.number().int().min(1).optional() });
export type PriceSyncData = z.input<typeof priceSyncData>;

/**
 * Runs the recorded Price sync `runId` over every Chain, one after another, recording each Chain's result. A Chain failure
 * is logged, reported and recorded, and the next Chain still runs. `signal` is checked between Chains, never inside one:
 * once it fires the sync stops and is recorded as interrupted. Marks the run `running` before its first await.
 */
export async function runPriceSync(deps: Deps, runId: number, { signal, maxStores = Infinity }: { signal?: AbortSignal; maxStores?: number }) {
  const { db, clock } = deps;
  db.update(syncRuns).set({ status: "running", startedAt: clock.now() }).where(eq(syncRuns.id, runId)).run();
  let interrupted = false;
  for (const chain of chainSeeds) {
    if (signal?.aborted) {
      interrupted = true;
      break;
    }
    const counts: ChainCounts = { filesDownloaded: 0, storesLoaded: 0, pricesLoaded: 0, storesGeocoded: 0 };
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
  db.update(syncRuns)
    .set({ status: interrupted ? "interrupted" : "finished", finishedAt: clock.now() })
    .where(eq(syncRuns.id, runId))
    .run();
}

const MIN = 60_000;
const jerusalem = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
// shortcut: a time inside the fall-back hour (01:00-02:00 on the last Sunday of October) fires twice; fine while none is there.
const isScheduled = (times: string[], ms: number) => times.includes(jerusalem.format(ms));

/** Minute starts in (from, to] that are scheduled times. */
function scheduledBetween(times: string[], from: number, to: number) {
  const due: number[] = [];
  for (let m = Math.floor(from / MIN) * MIN + MIN; m <= to; m += MIN) if (isScheduled(times, m)) due.push(m);
  return due;
}

/** The scheduled time before `t` (within 26 h, which covers a daylight-saving day). */
function previousScheduled(times: string[], t: number) {
  for (let m = t - MIN; m > t - 26 * 60 * MIN; m -= MIN) if (isScheduled(times, m)) return m;
  return t - 26 * 60 * MIN;
}

/**
 * The worker's once-a-minute check. Creating it is the worker's startup step: a sync still marked running was left by a
 * crash or kill, so it becomes interrupted. Each call then runs a waiting Manual sync request, runs or skips every scheduled
 * time since the previous call (times before the check was created are never made up), and marks other requests ignored.
 * The returned promise settles when the sync it started ends; a call made meanwhile sees that sync running.
 */
export function priceSyncCheck(deps: Deps, signal?: AbortSignal) {
  const { db, clock, config } = deps;
  db.update(syncRuns).set({ status: "interrupted" }).where(eq(syncRuns.status, "running")).run();
  let last = clock.now().getTime();

  return async () => {
    const now = clock.now();
    const due = scheduledBetween(config.SYNC_TIMES, last, now.getTime());
    last = now.getTime();
    // Synchronous up to runPriceSync, which marks the run running before it awaits: two checks never both start a sync.
    const running = db.select({ id: syncRuns.id }).from(syncRuns).where(eq(syncRuns.status, "running")).get();
    const waiting = db.select({ id: syncRuns.id }).from(syncRuns).where(eq(syncRuns.status, "requested")).orderBy(syncRuns.id).all();
    let runId = running ? undefined : waiting.shift()?.id;
    for (const { id } of waiting) db.update(syncRuns).set({ status: "ignored" }).where(eq(syncRuns.id, id)).run();

    for (const t of due) {
      const manualFinished = db
        .select({ id: syncRuns.id })
        .from(syncRuns)
        .where(
          and(
            eq(syncRuns.trigger, "manual"),
            eq(syncRuns.status, "finished"),
            gt(syncRuns.finishedAt, new Date(previousScheduled(config.SYNC_TIMES, t))),
          ),
        )
        .get();
      const skipReason = running || runId !== undefined ? "sync_running" : manualFinished ? "manual_sync" : null;
      const row = { trigger: "scheduled" as const, scheduledAt: new Date(t), requestedAt: now };
      if (skipReason) db.insert(syncRuns).values({ ...row, status: "skipped", skipReason }).run();
      else runId = db.insert(syncRuns).values({ ...row, status: "requested" }).returning({ id: syncRuns.id }).get().id;
    }

    if (runId !== undefined) await runPriceSync(deps, runId, { signal });
  };
}

/** `npm run worker`: runs the check once a minute until `signal` fires, then waits for the running sync to stop. */
export function syncWorkerJob(deps: Deps) {
  return async (_data: unknown, signal: AbortSignal) => {
    const check = priceSyncCheck(deps, signal);
    const ticks = new Set<Promise<void>>();
    console.log(`sync worker: Scheduled syncs at ${deps.config.SYNC_TIMES.join(", ")} Asia/Jerusalem`);
    while (!signal.aborted) {
      const tick: Promise<void> = check()
        .catch((e: unknown) => (console.error("sync worker: check failed", e), deps.errorHandler.report(e)))
        .finally(() => ticks.delete(tick));
      ticks.add(tick);
      await sleep(MIN, undefined, { signal }).catch(() => {});
    }
    await Promise.all(ticks);
  };
}

/** `npm run sync`: records a Manual sync and runs it now. Returns the sync run id. */
export function priceSyncJob(deps: Deps) {
  return async (data: PriceSyncData, signal?: AbortSignal) => {
    const { maxStores } = priceSyncData.parse(data);
    const { id } = deps.db
      .insert(syncRuns)
      .values({ trigger: "manual", status: "requested", requestedAt: deps.clock.now() })
      .returning({ id: syncRuns.id })
      .get();
    await runPriceSync(deps, id, { signal, maxStores });
    return id;
  };
}
