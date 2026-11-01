// Mirrors the API's emailOTP settings (apps/api/src/auth.ts).
const CODE_MS = 5 * 60_000;
export const MAX_TRIES = 3;
const RESEND_MS = 60_000;

export type CodeLock = "expired" | "tooManyTries";

/** The Reset code's life, from when it was sent and how many wrong tries it has had. A new send starts over at wrongTries 0. */
export function codeStatus({ sentAt, wrongTries }: { sentAt: number; wrongTries: number }, now: number) {
  const msLeft = Math.max(0, sentAt + CODE_MS - now);
  const lock: CodeLock | null = wrongTries >= MAX_TRIES ? "tooManyTries" : msLeft === 0 ? "expired" : null;
  return { msLeft, lock, resendInMs: Math.max(0, sentAt + RESEND_MS - now) };
}

/** m:ss, rounding up so the clock shows 0:00 only once time is really up. */
export function formatCountdown(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
