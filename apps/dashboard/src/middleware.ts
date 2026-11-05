import type { Deps } from "#/deps.ts";

// createApp sets `deps` on every request.
export type AppEnv = { Variables: { deps: Deps } };
