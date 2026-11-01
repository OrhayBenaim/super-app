import type { StringKey } from "@/lib/strings";

export type Fields = { name: string; email: string; password: string };
export type FieldErrors = Partial<Record<keyof Fields, StringKey>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns string keys for t(); empty object means valid. `name` is only checked on sign-up. */
export function validate({ name, email, password }: Fields, mode: "signIn" | "signUp"): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "signUp" && !name.trim()) errors.name = "auth.error.name";
  if (!EMAIL.test(email.trim())) errors.email = "auth.error.email";
  if (password.length < 8) errors.password = "auth.error.password";
  return errors;
}

/** Maps a better-auth error code to a localized message key. */
export function authErrorKey(code?: string): StringKey {
  if (code === "INVALID_EMAIL_OR_PASSWORD") return "auth.error.invalid";
  if (code?.startsWith("USER_ALREADY_EXISTS")) return "auth.error.exists";
  if (code === "INVALID_OTP") return "auth.reset.wrongCode";
  if (code === "OTP_EXPIRED") return "auth.reset.expired";
  if (code === "TOO_MANY_ATTEMPTS") return "auth.reset.tooManyTries";
  return "auth.error.generic";
}
