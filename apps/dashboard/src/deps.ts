import { apiClient, type ApiClient } from "#/api-client.ts";
import type { Config } from "#/services/config.ts";

export type Deps = { config: Config; api: ApiClient };

/** Composition root. Tests swap the api client for one routed in-process (tests/seam.ts). */
export function buildDeps(config: Config, overrides: Partial<Deps> = {}): Deps {
  return { config, api: apiClient(config), ...overrides };
}
