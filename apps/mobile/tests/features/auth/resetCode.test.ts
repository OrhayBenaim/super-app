import { expect, it } from "vitest";
import { formatCountdown, codeStatus } from "@/features/auth/resetCode";

const sentAt = 1_000_000;
const at = (s: number) => sentAt + s * 1000;

it("counts down from 5 minutes and reaches 0:00 at 5 minutes", () => {
  expect(formatCountdown(codeStatus({ sentAt, wrongTries: 0 }, at(0)).msLeft)).toBe("5:00");
  expect(formatCountdown(codeStatus({ sentAt, wrongTries: 0 }, at(0.4)).msLeft)).toBe("5:00");
  expect(formatCountdown(codeStatus({ sentAt, wrongTries: 0 }, at(61)).msLeft)).toBe("3:59");
  expect(formatCountdown(codeStatus({ sentAt, wrongTries: 0 }, at(300)).msLeft)).toBe("0:00");
  expect(codeStatus({ sentAt, wrongTries: 0 }, at(999)).msLeft).toBe(0);
});

it("locks as expired at 5 minutes", () => {
  expect(codeStatus({ sentAt, wrongTries: 0 }, at(299)).lock).toBeNull();
  expect(codeStatus({ sentAt, wrongTries: 0 }, at(300)).lock).toBe("expired");
});

it("locks after 3 wrong tries, even before expiry", () => {
  expect(codeStatus({ sentAt, wrongTries: 2 }, at(10)).lock).toBeNull();
  expect(codeStatus({ sentAt, wrongTries: 3 }, at(10)).lock).toBe("tooManyTries");
  expect(codeStatus({ sentAt, wrongTries: 3 }, at(400)).lock).toBe("tooManyTries");
});

it("allows a new code 60 seconds after the last send, while the countdown still runs", () => {
  expect(codeStatus({ sentAt, wrongTries: 0 }, at(59)).resendInMs).toBe(1000);
  const s = codeStatus({ sentAt, wrongTries: 0 }, at(60));
  expect(s.resendInMs).toBe(0);
  expect(s.lock).toBeNull();
});

it("a new send unlocks, clears wrong tries and restarts the countdown", () => {
  const now = at(400);
  const s = codeStatus({ sentAt: now, wrongTries: 0 }, now);
  expect(s).toEqual({ msLeft: 300_000, lock: null, resendInMs: 60_000 });
});
