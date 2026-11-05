// The dashboard holds no data: every read and write goes to the api's private app (docs/adr/0005), typed from its routes.
import { hc } from "hono/client";
import type { createInternalApp } from "api/src/internal-app.ts";
import type { Config } from "#/services/config.ts";

export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>;

/** The private app's client with the SYNC_TOKEN bearer. Tests pass a `fetch` that calls the private app in-process. */
export function apiClient(config: Pick<Config, "API_URL" | "SYNC_TOKEN">, fetch: Fetch = globalThis.fetch) {
  return hc<ReturnType<typeof createInternalApp>>(config.API_URL, { fetch, headers: { Authorization: `Bearer ${config.SYNC_TOKEN}` } });
}

export type ApiClient = ReturnType<typeof apiClient>;
