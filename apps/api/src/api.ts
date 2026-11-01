import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";

const config = loadConfig();
serve({ fetch: createApp(buildDeps(config)).fetch, port: config.PORT }, (info) =>
  console.log(`api listening on http://localhost:${info.port}`),
);
