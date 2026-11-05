import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import type { Deps } from "#/deps.ts";
import type { AppEnv } from "#/middleware.ts";
import { chainsRoutes } from "#/routes/chains.ts";
import { syncsRoutes } from "#/routes/syncs.ts";

const htmx = readFileSync(createRequire(import.meta.url).resolve("htmx.org/dist/htmx.min.js"), "utf8");

/** The Internal dashboard: no sign-in (the tailnet is the access control, docs/adr/0005); one router per page. */
export function createApp(deps: Deps) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set("deps", deps);
      await next();
    })
    // No sign-in, so a page on another site must not post to the dashboard from the operator's browser.
    .use(csrf())
    .get("/assets/htmx.min.js", (c) =>
      c.body(htmx, 200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=86400" }),
    )
    .route("/", syncsRoutes)
    .route("/", chainsRoutes)
    .onError((error, c) => {
      if (error instanceof HTTPException) return error.getResponse();
      console.error(error);
      return c.html("<p>Something went wrong. The details are in the dashboard's log.</p>", 500);
    });
}
