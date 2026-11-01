// The private trigger: a separate Hono app on INTERNAL_HOST:INTERNAL_PORT, never on the public port.
// It only records Manual sync requests; the worker's check runs them.
import { createHash, timingSafeEqual } from "node:crypto";
import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import { syncRuns } from "#/db/appSchema.ts";
import type { Deps } from "#/deps.ts";

export function createInternalApp(deps: Deps) {
  const token = deps.config.SYNC_TOKEN;
  if (!token) throw new Error("SYNC_TOKEN is not set");
  const { db, clock } = deps;
  // Hashing first gives equal lengths, so the comparison takes the same time for any wrong header.
  const sha = (s: string) => createHash("sha256").update(s).digest();
  const expected = sha(`Bearer ${token}`);

  return new Hono()
    .use(async (c, next) => {
      // 401 for a missing, malformed or wrong header alike (hono's bearerAuth answers 400 to a malformed one).
      if (!timingSafeEqual(sha(c.req.header("Authorization") ?? ""), expected)) return c.json({ error: "unauthorized" }, 401);
      await next();
    })
    .post("/sync", (c) => {
      const busy = db
        .select({ id: syncRuns.id })
        .from(syncRuns)
        .where(inArray(syncRuns.status, ["requested", "running"]))
        .get();
      if (busy) return c.json({ error: "sync_running" }, 409);
      const { id } = db
        .insert(syncRuns)
        .values({ trigger: "manual", status: "requested", requestedAt: clock.now() })
        .returning({ id: syncRuns.id })
        .get();
      return c.json({ id }, 202);
    })
    .onError((error, c) => {
      console.error(error);
      deps.errorHandler.report(error);
      return c.json({ error: "internal" }, 500);
    });
}
