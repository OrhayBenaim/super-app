import { Hono } from "hono";
import { unexpected } from "#/api-client.ts";
import type { AppEnv } from "#/middleware.ts";
import { chainsPage } from "#/pages/chains.ts";
import { layout } from "#/pages/layout.ts";

export const chainsRoutes = new Hono<AppEnv>().get("/chains", async (c) => {
  const res = await c.var.deps.api.chains.$get();
  if (res.status !== 200) throw unexpected(res, "GET /chains");
  return c.html(layout("Chains", chainsPage((await res.json()).chains)));
});
