import { createMiddleware } from "hono/factory";
import { auth } from "./auth.js";

export type AppEnv = { Variables: { user: typeof auth.$Infer.Session.user } };

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("user", session.user);
  await next();
});
