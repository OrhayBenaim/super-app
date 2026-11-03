/** The rules every OTP (CONTEXT.md: Reset code, Deletion code) follows. The API enforces them; the app shows them. */
export const OTP = { length: 6, minutes: 5, maxTries: 3, resendAfterSeconds: 60 } as const;

/** A sent OTP. A new send starts over at wrongTries 0. */
export type SentCode = { sentAt: number; wrongTries: number };

export type CodeLock = "expired" | "tooManyTries";

/** The OTP's life at `now` (ms): time left, why it can no longer be used, and the wait before a new code can be sent. */
export function codeStatus({ sentAt, wrongTries }: SentCode, now: number) {
  const msLeft = Math.max(0, sentAt + OTP.minutes * 60_000 - now);
  const lock: CodeLock | null = wrongTries >= OTP.maxTries ? "tooManyTries" : msLeft === 0 ? "expired" : null;
  return { msLeft, lock, resendInMs: Math.max(0, sentAt + OTP.resendAfterSeconds * 1000 - now) };
}
