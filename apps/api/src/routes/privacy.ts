import { readFileSync } from "node:fs";
import { Hono } from "hono";
import type { AppEnv } from "#/middleware.ts";

// A static page, read once at startup; edit the HTML file to change the policy.
const page = readFileSync(new URL("../pages/privacy.html", import.meta.url), "utf8");

export const privacyRoutes = new Hono<AppEnv>().get("/", (c) => c.html(page));
