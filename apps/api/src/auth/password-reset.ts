import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { RESET_CODE } from "@grocer/shared/reset-code";
import type { Db } from "#/db/index.ts";
import { hasPassword } from "#/db/users.ts";
import { resetCodeEmail } from "#/emails/reset-code.ts";
import type { ErrorHandler } from "#/services/error-handler.ts";
import type { MailerService } from "#/services/mailer.ts";

const REQUEST_PATH = "/email-otp/request-password-reset";
const RESET_PATH = "/email-otp/reset-password";

/** emailOTP paths Password reset doesn't use (OTP sign-in, email verification, the deprecated request). For betterAuth's `disabledPaths`. */
export const unusedOtpPaths = ["/sign-in/email-otp", "/email-otp/send-verification-otp", "/email-otp/verify-email", "/forget-password/email-otp"];

/**
 * Password reset with an emailed Reset code, as better-auth plugins. Only Users with a password take part:
 * others get the same answer as a real request but no code, and can't use a code to gain a password.
 */
export function passwordReset(db: Db, mailer: MailerService, errorHandler: ErrorHandler) {
  const withoutPassword = (email: unknown) => typeof email === "string" && !hasPassword(db, email.toLowerCase());
  const policy = {
    id: "password-reset",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === REQUEST_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            if (withoutPassword(ctx.body?.email)) return ctx.json({ success: true });
          }),
        },
        {
          matcher: (ctx) => ctx.path === RESET_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            if (withoutPassword(ctx.body?.email)) throw APIError.from("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;

  const otp = emailOTP({
    otpLength: RESET_CODE.length,
    expiresIn: RESET_CODE.minutes * 60,
    allowedAttempts: RESET_CODE.maxTries,
    // The policy hook has already turned away Users without a password. Not awaited, so a real account answers as fast
    // as any other email, and a failed send can't turn into an error only real accounts see.
    async sendVerificationOTP({ email, otp }) {
      mailer.send(resetCodeEmail(email, otp)).catch((error: unknown) => {
        console.error("password reset: Reset code email not sent", error);
        errorHandler.report(error);
      });
    },
  });

  return [otp, policy] as const;
}
