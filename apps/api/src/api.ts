import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { createInternalApp } from "#/internal-app.ts";
import { loadConfig } from "#/services/config.ts";

const config = loadConfig();
const deps = buildDeps(config);
serve({ fetch: createApp(deps).fetch, port: config.PORT }, (info) => console.log(`api listening on http://localhost:${info.port}`));

if (config.SYNC_TOKEN)
  serve({ fetch: createInternalApp(deps).fetch, port: config.INTERNAL_PORT, hostname: config.INTERNAL_HOST }, (info) =>
    console.log(`private trigger listening on http://${config.INTERNAL_HOST}:${info.port}`),
  );
else console.log("private trigger off: SYNC_TOKEN is not set");

// Flush queued analytics events before exiting (node --watch restarts and deploys send SIGTERM).
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void deps.analytics.shutdown().finally(() => process.exit(0)));
