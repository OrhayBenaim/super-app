import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import type { Db } from "#/db/index.ts";
import * as schema from "#/db/schema.ts";
import type { Config } from "#/services/config.ts";
import type { MailerService } from "#/services/mailer.ts";

// mailer: sends Password reset emails (#11).
export function createAuth(db: Db, config: Config, mailer: MailerService) {
  return betterAuth({
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    // Account deletion: schema cascades remove owned Lists and memberships; sessions older than freshAge get SESSION_EXPIRED.
    user: { deleteUser: { enabled: true } },
    socialProviders: {
      ...(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET } }
        : {}),
      ...(config.APPLE_CLIENT_ID && config.APPLE_CLIENT_SECRET
        ? {
            apple: {
              clientId: config.APPLE_CLIENT_ID,
              clientSecret: config.APPLE_CLIENT_SECRET,
              appBundleIdentifier: config.APPLE_APP_BUNDLE_IDENTIFIER,
            },
          }
        : {}),
    },
    trustedOrigins: [
      "grocer://",
      "grocer://*",
      "https://appleid.apple.com", // Apple posts its callback from this origin
      ...config.TRUSTED_ORIGINS,
    ],
    plugins: [expo()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
