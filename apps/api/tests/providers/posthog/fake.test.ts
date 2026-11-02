import { expect, it } from "vitest";
import { fakeAnalytics } from "#/providers/posthog/fake.ts";

it("records events and keeps only the last 100", () => {
  const analytics = fakeAnalytics();
  for (let i = 0; i < 101; i++) analytics.capture("u1", "list_shared", { i });
  expect(analytics.captured).toHaveLength(100);
  expect(analytics.captured[0]).toEqual({ distinctId: "u1", event: "list_shared", properties: { i: 1 } });
});
