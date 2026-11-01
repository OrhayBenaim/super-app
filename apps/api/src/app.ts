import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Deps } from "#/deps.ts";
import type { AppEnv } from "#/middleware.ts";
import { listsRoutes } from "#/routes/lists.ts";
import { pricesRoutes } from "#/routes/prices.ts";

export function createApp(deps: Deps) {
  // Native apps send no Origin header; CORS only matters for Expo web (Metro on :8081).
  const corsOrigins = ["http://localhost:8081", ...deps.config.TRUSTED_ORIGINS];

  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set("deps", deps);
      await next();
    })
    .use(cors({ origin: corsOrigins, credentials: true }))
    .all("/api/auth/*", (c) => deps.auth.handler(c.req.raw))
    .get("/health", (c) => {
      try {
        deps.db.$client.prepare("SELECT 1").get();
        return c.json({ status: "ok" });
      } catch (error) {
        console.error("health check: database unreachable", error);
        return c.json({ status: "error" }, 503);
      }
    })
    .route("/api/lists", listsRoutes)
    .route("/api", pricesRoutes)
    .onError((error, c) => {
      if (error instanceof HTTPException) return error.getResponse();
      console.error(error);
      deps.errorHandler.report(error);
      return c.json({ error: "internal" }, 500);
    });
}
