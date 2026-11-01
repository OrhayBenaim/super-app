import type { StringKey } from "@/lib/strings";

export type Fields = { name: string; email: string; password: string };
export type FieldErrors = Partial<Record<keyof Fields, StringKey>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailError = (email: string): StringKey | undefined => (EMAIL.test(email.trim()) ? undefined : "auth.error.email");
export const passwordError = (password: string): StringKey | undefined => (password.length < 8 ? "auth.error.password" : undefined);

/** Returns string keys for t(); empty object means valid. `name` is only checked on sign-up. */
export function validate({ name, email, password }: Fields, mode: "signIn" | "signUp"): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "signUp" && !name.trim()) errors.name = "auth.error.name";
  const e = emailError(email);
  if (e) errors.email = e;
  const p = passwordError(password);
  if (p) errors.password = p;
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
