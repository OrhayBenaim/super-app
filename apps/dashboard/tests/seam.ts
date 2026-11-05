// The dashboard's test seam: its api fetch goes in-process to the api's private app on an in-memory DB.
import { buildDeps as buildApiDeps, type Deps as ApiDeps } from "api/src/deps.ts";
import { createInternalApp } from "api/src/internal-app.ts";
import { loadConfig as loadApiConfig } from "api/src/services/config.ts";
import { fakeClock } from "api/src/utils/clock.ts";
import { apiClient } from "#/api-client.ts";
import { createApp } from "#/app.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";

export const TOKEN = "test-sync-token";

/**
 * `api`: the private app's deps (seed its db); `app`: the dashboard; `privateApp`: to read what the api returns after.
 * The Product image lookup answers none unless a test passes its own, so no test reaches the image servers.
 * `now` fixes the time for both: the api's clock and the dashboard's. `requests`: each path the dashboard asked the private app for.
 */
export function setup({
  api: apiOverrides = {},
  token = TOKEN,
  productImage = async () => null,
  now,
}: { api?: Partial<ApiDeps>; token?: string; productImage?: Deps["productImage"]; now?: Date } = {}) {
  const api = buildApiDeps(loadApiConfig({ ...process.env, SYNC_TOKEN: TOKEN }), { ...(now && { clock: fakeClock(now) }), ...apiOverrides });
  const privateApp = createInternalApp(api);
  const config = loadConfig({ API_URL: "http://api.internal:3001", SYNC_TOKEN: token });
  const requests: string[] = [];
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new URL(input instanceof Request ? input.url : input).pathname);
    return privateApp.request(input, init);
  };
  const app = createApp(buildDeps(config, { api: apiClient(config, fetch), productImage, ...(now && { now: () => now }) }));
  return { api, app, privateApp, requests };
}

/** A same-origin htmx POST, as the browser sends it (csrf passes on Sec-Fetch-Site). */
export const post = () => ({ method: "POST", headers: { "Sec-Fetch-Site": "same-origin", "HX-Request": "true" } });
