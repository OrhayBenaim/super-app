import { describe, expect, it } from "vitest";
import { chainOutcome } from "@grocer/shared/sync-history";

describe("chainOutcome", () => {
  it("is a Chain failure whatever its Promotions did, else a Promotion failure, else ok", () => {
    expect(chainOutcome({ status: "failed", promotionStatus: "ok" })).toBe("failed");
    expect(chainOutcome({ status: "failed", promotionStatus: "failed" })).toBe("failed");
    expect(chainOutcome({ status: "ok", promotionStatus: "failed" })).toBe("promotionFailed");
    expect(chainOutcome({ status: "ok", promotionStatus: null })).toBe("ok");
  });
});
