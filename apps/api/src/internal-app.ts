// The private trigger: a separate Hono app on INTERNAL_HOST:INTERNAL_PORT, never on the public port.
// It only records Manual sync requests; the worker's check runs them.
import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Deps } from "#/deps.ts";
import { requestManualSync } from "#/jobs/price-sync.ts";

export function createInternalApp(deps: Deps) {
  const token = deps.config.SYNC_TOKEN;
  if (!token) throw new Error("SYNC_TOKEN is not set");
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
      const id = requestManualSync(deps);
      return id === null ? c.json({ error: "busy" }, 409) : c.json({ id }, 202);
    })
    .onError((error, c) => {
      console.error(error);
      deps.errorHandler.report(error);
      return c.json({ error: "internal" }, 500);
    });
}
