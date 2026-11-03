import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Deps } from "#/deps.ts";
import { rateLimit, type AppEnv } from "#/middleware.ts";
import { deletionRoutes } from "#/routes/deletion.ts";
import { listsRoutes } from "#/routes/lists.ts";
import { pricesRoutes } from "#/routes/prices.ts";
import { privacyRoutes } from "#/routes/privacy.ts";

const MINUTE = 60_000;

export function createApp(deps: Deps) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set("deps", deps);
      await next();
    })
    .use(rateLimit({ max: 300, windowMs: MINUTE }))
    // Stricter where a password, a Reset code or a Deletion code can be guessed.
    .use("/api/auth/sign-in/*", rateLimit({ max: 10, windowMs: MINUTE }))
    .use("/deletion/sign-in/*", rateLimit({ max: 10, windowMs: MINUTE }))
    .use("/api/auth/sign-up/*", rateLimit({ max: 10, windowMs: MINUTE }))
    .use("/api/auth/email-otp/*", rateLimit({ max: 5, windowMs: MINUTE }))
    .use("/deletion/code/*", rateLimit({ max: 5, windowMs: MINUTE }))
    .use("/api/lists/join", rateLimit({ max: 10, windowMs: MINUTE }))
    // Every JSON body is a few KB at most; without a cap, one unauthenticated sign-up could buffer gigabytes.
    .use(bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "too_large" }, 413) }))
    // Native apps send no Origin header; CORS only matters for Expo web (dev: TRUSTED_ORIGINS=http://localhost:8081).
    .use(cors({ origin: deps.config.TRUSTED_ORIGINS, credentials: true }))
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
    // Public page for the store listings (Google Play requires a privacy policy URL).
    .route("/privacy", privacyRoutes)
    // Public Account deletion and Data deletion page (Google Play's Data safety links /delete-account and /delete-data).
    .route("/", deletionRoutes)
    .onError((error, c) => {
      if (error instanceof HTTPException) return error.getResponse();
      console.error(error);
      deps.errorHandler.report(error);
      return c.json({ error: "internal" }, 500);
    });
}
