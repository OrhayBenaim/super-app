import { lookupProductImage } from "@grocer/shared/product-image";
import { apiClient, type ApiClient } from "#/api-client.ts";
import type { Config } from "#/services/config.ts";

// productImage: the shared Product image lookup; the page renders its URL, so the browser caches the bytes.
// now: what "Today", "so far" and the 90-day strip count from.
export type Deps = { config: Config; api: ApiClient; productImage: (code: string) => Promise<string | null>; now: () => Date };

/** Composition root. Tests swap the api client for one routed in-process and the image lookup for a fake (tests/seam.ts). */
export function buildDeps(config: Config, overrides: Partial<Deps> = {}): Deps {
  return { config, api: apiClient(config), productImage: lookupProductImage, now: () => new Date(), ...overrides };
}
