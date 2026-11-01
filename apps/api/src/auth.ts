import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import type { Db } from "#/db/index.ts";
import * as schema from "#/db/schema.ts";
import type { Config } from "#/services/config.ts";
import type { Email, MailerService } from "#/services/mailer.ts";

const RESET_MINUTES = 5;

/** The Reset code email: Hebrew first, English below. */
function resetCodeEmail(to: string, code: string, minutes: number): Email {
  const he = [`קוד האיפוס שלך ל-Grocer: ${code}`, `הקוד בתוקף ל-${minutes} דקות.`, "אם לא ביקשת לאפס את הסיסמה, אפשר להתעלם מהמייל הזה."];
  const en = [`Your Grocer reset code: ${code}`, `It is valid for ${minutes} minutes.`, "If you didn't ask to reset your password, you can ignore this email."];
  const block = (lines: string[], dir: "rtl" | "ltr") =>
    `<div dir="${dir}">${lines.map((l) => `<p>${l.replace(code, `<strong style="font-size:24px;letter-spacing:4px">${code}</strong>`)}</p>`).join("")}</div>`;
  return {
    to,
    subject: "קוד לאיפוס הסיסמה · Your Grocer reset code",
    text: [...he, "", ...en].join("\n"),
    html: `${block(he, "rtl")}<hr>${block(en, "ltr")}`,
  };
}

export function createAuth(db: Db, config: Config, mailer: MailerService) {
  const hasPassword = (email: string) =>
    !!db
      .select({ id: schema.account.id })
      .from(schema.account)
      .innerJoin(schema.user, eq(schema.user.id, schema.account.userId))
      .where(and(eq(schema.user.email, email), eq(schema.account.providerId, "credential")))
      .get();

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
        const email = ctx.body?.email;
        if (typeof email !== "string" || hasPassword(email.toLowerCase())) return;
        if (ctx.path === "/email-otp/request-password-reset") return ctx.json({ success: true });
        if (ctx.path === "/email-otp/reset-password") throw APIError.from("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
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
        otpLength: 6,
        expiresIn: RESET_MINUTES * 60,
        allowedAttempts: 3,
        // Only the password-reset paths are enabled, and the hook above lets through only Users with a password.
        async sendVerificationOTP({ email, otp }) {
          await mailer.send(resetCodeEmail(email, otp, RESET_MINUTES));
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
