import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { RESET_CODE } from "@grocer/shared/reset-code";
import type { Db } from "#/db/index.ts";
import * as schema from "#/db/schema.ts";
import { hasPassword } from "#/db/users.ts";
import { resetCodeEmail } from "#/emails/reset-code.ts";
import type { Config } from "#/services/config.ts";
import type { MailerService } from "#/services/mailer.ts";

export function createAuth(db: Db, config: Config, mailer: MailerService) {
  return betterAuth({
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true, revokeSessionsOnPasswordReset: true },
    // emailOTP is only for Password reset: no OTP sign-in, no email verification.
    disabledPaths: ["/sign-in/email-otp", "/email-otp/send-verification-otp", "/email-otp/verify-email", "/forget-password/email-otp"],
    // Password reset is only for Users with a password: others get the same answer as a real request but no code,
    // and can't use a code to gain a password.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const request = ctx.path === "/email-otp/request-password-reset";
        if (!request && ctx.path !== "/email-otp/reset-password") return;
        const email = ctx.body?.email;
        if (typeof email !== "string" || hasPassword(db, email.toLowerCase())) return;
        if (request) return ctx.json({ success: true });
        throw APIError.from("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
      }),
    },
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
    plugins: [
      expo(),
      emailOTP({
        otpLength: RESET_CODE.length,
        expiresIn: RESET_CODE.minutes * 60,
        allowedAttempts: RESET_CODE.maxTries,
        // Only the password-reset paths are enabled, and the hook above lets through only Users with a password.
        async sendVerificationOTP({ email, otp }) {
          await mailer.send(resetCodeEmail(email, otp));
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
