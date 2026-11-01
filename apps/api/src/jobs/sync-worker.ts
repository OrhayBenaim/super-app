import { setTimeout as sleep } from "node:timers/promises";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { syncRuns } from "#/db/appSchema.ts";
import type { Deps } from "#/deps.ts";
import { runPriceSync } from "#/jobs/price-sync.ts";

export const syncWorkerData = z.object({});
export type SyncWorkerData = z.input<typeof syncWorkerData>;

const MINUTE = 60_000;
const jerusalem = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
// shortcut: a time inside the fall-back hour (01:00-02:00 on the last Sunday of October) fires twice; fine while none is there.
const isScheduled = (times: string[], ms: number) => times.includes(jerusalem.format(ms));

/** Minute starts in (from, to] that are scheduled times. */
function scheduledBetween(times: string[], from: number, to: number) {
  const due: number[] = [];
  for (let m = Math.floor(from / MINUTE) * MINUTE + MINUTE; m <= to; m += MINUTE) if (isScheduled(times, m)) due.push(m);
  return due;
}

/** The scheduled time before `t` (within 26 h, which covers a daylight-saving day). */
function previousScheduled(times: string[], t: number) {
  for (let m = t - MINUTE; m > t - 26 * 60 * MINUTE; m -= MINUTE) if (isScheduled(times, m)) return m;
  return t - 26 * 60 * MINUTE;
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
  let lastCheck = clock.now().getTime();

  return async () => {
    const now = clock.now();
    const due = scheduledBetween(config.SYNC_TIMES, lastCheck, now.getTime());
    lastCheck = now.getTime();
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

/** `npm run worker`: runs the check once a minute until `signal` (SIGTERM) fires, then waits for the running sync to stop. */
export function syncWorkerJob(deps: Deps) {
  return async (data: SyncWorkerData, signal: AbortSignal) => {
    syncWorkerData.parse(data);
    const check = priceSyncCheck(deps, signal);
    const ticks = new Set<Promise<void>>();
    console.log(`sync worker: Scheduled syncs at ${deps.config.SYNC_TIMES.join(", ")} Asia/Jerusalem`);
    while (!signal.aborted) {
      const tick: Promise<void> = check()
        .catch((e: unknown) => (console.error("sync worker: check failed", e), deps.errorHandler.report(e)))
        .finally(() => ticks.delete(tick));
      ticks.add(tick);
      await sleep(MINUTE, undefined, { signal }).catch(() => {});
    }
    await Promise.all(ticks);
  };
}
