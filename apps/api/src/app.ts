import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.js";
import { type AppEnv } from "./middleware.js";
import { listsRoutes } from "./routes/lists.js";
import { pricesRoutes } from "./routes/prices.js";

// Native apps send no Origin header; CORS only matters for Expo web (Metro on :8081).
const corsOrigins = [
  "http://localhost:8081",
  ...(process.env.TRUSTED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
];

export const app = new Hono<AppEnv>();

app.use("*", cors({ origin: corsOrigins, credentials: true }));
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
app.get("/health", (c) => c.json({ ok: true }));

// Feature routes: app.route("/api/<name>", <name>Routes) from ./routes/<name>.ts, guarded with requireUser.
app.route("/api/lists", listsRoutes);
app.route("/api", pricesRoutes);
