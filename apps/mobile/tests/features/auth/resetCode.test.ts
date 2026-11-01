import { expect, it } from "vitest";
import { formatCountdown } from "@/features/auth/resetCode";

it("shows m:ss, rounding up so 0:00 means time is up", () => {
  expect(formatCountdown(300_000)).toBe("5:00");
  expect(formatCountdown(299_600)).toBe("5:00");
  expect(formatCountdown(239_000)).toBe("3:59");
  expect(formatCountdown(500)).toBe("0:01");
  expect(formatCountdown(0)).toBe("0:00");
});
