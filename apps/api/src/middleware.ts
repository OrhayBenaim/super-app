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
