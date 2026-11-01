import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Auth } from "#/auth.ts";
import type { Deps } from "#/deps.ts";

// createApp sets `deps` on every request; requireUser sets `user`.
export type AppEnv = { Variables: { deps: Deps; user: Auth["$Infer"]["Session"]["user"] } };

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await c.var.deps.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("user", session.user);
  await next();
});

function clientIp(c: Context<AppEnv>): string | undefined {
  // The proxy appends the address it saw, so only the last hop is trustworthy.
  const forwarded = c.var.deps.config.TRUST_PROXY ? c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() : undefined;
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // app.request() in tests has no socket
  }
}

/**
 * Allows `max` requests per client IP in each `windowMs` window, then answers 429 with Retry-After.
 * shortcut: counts live in this process's memory and reset on restart; move them to shared storage when the API runs more than one process.
 */
export function rateLimit({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = clientIp(c);
    if (!ip) return next();
    const now = c.var.deps.clock.now().getTime();
    let hit = hits.get(ip);
    if (!hit || hit.resetAt <= now) {
      if (hits.size >= 10_000) for (const [key, h] of hits) if (h.resetAt <= now) hits.delete(key);
      hit = { count: 0, resetAt: now + windowMs };
      hits.set(ip, hit);
    }
    if (++hit.count > max) {
      c.header("Retry-After", String(Math.ceil((hit.resetAt - now) / 1000)));
      return c.json({ error: "too_many_requests" }, 429);
    }
    await next();
  });
}
