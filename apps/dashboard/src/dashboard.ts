import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";

const config = loadConfig();
serve({ fetch: createApp(buildDeps(config)).fetch, port: config.PORT, hostname: config.HOST }, (info) =>
  console.log(`dashboard listening on http://${config.HOST}:${info.port}`),
);
