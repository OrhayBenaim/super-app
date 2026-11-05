import { lookupProductImage } from "@grocer/shared/product-image";
import { apiClient, type ApiClient } from "#/api-client.ts";
import type { Config } from "#/services/config.ts";

// productImage: the shared Product image lookup; the page renders its URL, so the browser caches the bytes.
export type Deps = { config: Config; api: ApiClient; productImage: (code: string) => Promise<string | null> };

/** Composition root. Tests swap the api client for one routed in-process and the image lookup for a fake (tests/seam.ts). */
export function buildDeps(config: Config, overrides: Partial<Deps> = {}): Deps {
  return { config, api: apiClient(config), productImage: lookupProductImage, ...overrides };
}
