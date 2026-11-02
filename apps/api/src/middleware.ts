import { isIPv6 } from "node:net";
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
  c.var.deps.errorHandler.setUser(session.user.id);
  await next();
});

export const MAX_CLIENTS = 10_000;

function clientIp(c: Context<AppEnv>): string | undefined {
  // The proxy appends the address it saw, so only the last hop is trustworthy, and only if
  // clients can reach this listener solely through that proxy (TRUST_PROXY's deploy rule).
  const forwarded = c.var.deps.config.TRUST_PROXY ? c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() : undefined;
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // app.request() in tests has no socket
  }
}

/** Rate limit key: one IPv6 client usually holds a whole /64, so the /64 counts as one client. IPv4 (also IPv4-mapped) stays per address. */
export function clientKey(ip: string) {
  if (!isIPv6(ip) || ip.includes(".")) return ip;
  const [head, tail] = ip.split("%")[0]!.split("::") as [string, string?];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array<string>(8 - h.length - t.length).fill("0"), ...t];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/**
 * Allows `max` requests per client (see clientKey) in each `windowMs` window, then answers 429 with Retry-After.
 * One window for all clients: when it ends the map is cleared, so memory holds at most one window of addresses.
 * shortcut: counts live in this process's memory and reset on restart; move them to shared storage when the API runs more than one process.
 */
export function rateLimit({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, number>();
  let resetAt = 0;
  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = clientIp(c);
    if (!ip) return next();
    const key = clientKey(ip);
    const now = c.var.deps.clock.now().getTime();
    if (now >= resetAt) {
      hits.clear();
      resetAt = now + windowMs;
    }
    const count = (hits.get(key) ?? 0) + 1;
    // When full, new addresses go uncounted until the window ends; tracked ones stay limited.
    if (count === 1 && hits.size >= MAX_CLIENTS) return next();
    hits.set(key, count);
    if (count > max) {
      c.header("Retry-After", String(Math.ceil((resetAt - now) / 1000)));
      return c.json({ error: "too_many_requests" }, 429);
    }
    await next();
  });
}
