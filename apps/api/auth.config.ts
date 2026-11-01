// For `npx auth@latest generate --config auth.config.ts`: the better-auth CLI needs an exported `auth`. Never imported by the app.
import { buildDeps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";

export const auth = buildDeps(loadConfig({ ...process.env, RESEND_API_KEY: process.env.RESEND_API_KEY || "unused", DATABASE_URL: ":memory:" })).auth;
