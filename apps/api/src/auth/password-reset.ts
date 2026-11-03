import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import type { Db } from "#/db/index.ts";
import { hasPassword } from "#/db/users.ts";
import { resetCodeEmail } from "#/emails/reset-code.ts";
import type { OtpResult, OtpService } from "#/services/otp.ts";

// The codes better-auth's emailOTP plugin answers with; the app's emailOTPClient and its messages rely on them.
const otpError: Record<Exclude<OtpResult, "ok">, () => APIError> = {
  wrong: () => APIError.from("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" }),
  expired: () => APIError.from("BAD_REQUEST", { code: "OTP_EXPIRED", message: "OTP expired" }),
  tooManyTries: () => APIError.from("FORBIDDEN", { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts" }),
};

/**
 * Password reset with an emailed Reset code from the OtpService, as a better-auth plugin at emailOTP's paths
 * (`/email-otp/request-password-reset`, `/email-otp/reset-password`). Only Users with a password take part: others get
 * the same answer as a real request but no code, and can't use a code to gain a password.
 */
export function passwordReset(db: Db, otp: OtpService) {
  return {
    id: "password-reset",
    endpoints: {
      requestPasswordReset: createAuthEndpoint(
        "/email-otp/request-password-reset",
        { method: "POST", body: z.object({ email: z.email() }) },
        async (ctx) => {
          const email = ctx.body.email.toLowerCase();
          // Every email gets a code, so reset-password answers an unknown email exactly like a real one; only real ones get it sent.
          const code = otp.create("password-reset", email);
          if (hasPassword(db, email)) otp.send(resetCodeEmail(email, code));
          return ctx.json({ success: true });
        },
      ),
      resetPassword: createAuthEndpoint(
        "/email-otp/reset-password",
        // Any string: a malformed email just has no code, like any email nobody requested one for.
        { method: "POST", body: z.object({ email: z.string(), otp: z.string(), password: z.string() }) },
        async (ctx) => {
          const email = ctx.body.email.toLowerCase();
          const { password } = ctx.body;
          const { internalAdapter, password: passwords } = ctx.context;
          if (password.length < passwords.config.minPasswordLength)
            throw APIError.from("BAD_REQUEST", { code: "PASSWORD_TOO_SHORT", message: "Password too short" });
          if (password.length > passwords.config.maxPasswordLength)
            throw APIError.from("BAD_REQUEST", { code: "PASSWORD_TOO_LONG", message: "Password too long" });

          // The code first: its answer is the same whether or not the email has a password account.
          const result = otp.verify("password-reset", email, ctx.body.otp);
          if (result !== "ok") throw otpError[result]();
          const found = hasPassword(db, email) ? await internalAdapter.findUserByEmail(email) : null;
          if (!found) throw otpError.wrong();

          const { id, emailVerified } = found.user;
          const hash = await passwords.hash(password);
          await internalAdapter.deleteUserSessions(id); // sessions from before the reset end
          await internalAdapter.updatePassword(id, hash);
          if (!emailVerified) await internalAdapter.updateUser(id, { emailVerified: true }); // the code proved the email
          return ctx.json({ success: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
