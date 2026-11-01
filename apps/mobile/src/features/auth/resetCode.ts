import type { StringKey } from "@/lib/strings";

// Mirrors the API's emailOTP settings (apps/api/src/auth.ts).
const CODE_MS = 5 * 60_000;
export const MAX_TRIES = 3;
const RESEND_MS = 60_000;

/** A sent Reset code. A new send starts over at wrongTries 0. */
export type SentCode = { sentAt: number; wrongTries: number };

/** The Reset code's life; `lock` is the message key for a code that can no longer be used. */
export function codeStatus({ sentAt, wrongTries }: SentCode, now: number) {
  const msLeft = Math.max(0, sentAt + CODE_MS - now);
  const lock: StringKey | null = wrongTries >= MAX_TRIES ? "auth.reset.tooManyTries" : msLeft === 0 ? "auth.reset.expired" : null;
  return { msLeft, lock, resendInMs: Math.max(0, sentAt + RESEND_MS - now) };
}

/** m:ss, rounding up so the clock shows 0:00 only once time is really up. */
export function formatCountdown(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
