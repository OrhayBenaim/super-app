// For `npx auth@latest generate --config auth.config.ts`: the better-auth CLI needs an exported `auth`. Never imported by the app.
import { buildDeps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";

export const auth = buildDeps(loadConfig({ ...process.env, DATABASE_URL: ":memory:" })).auth;
