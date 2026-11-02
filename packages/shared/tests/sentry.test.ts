import { expect, it } from "vitest";
import { tracesSampleRate } from "@grocer/shared/sentry";

it("traces everything in development and the same share in production on both apps", () => {
  expect(tracesSampleRate("development")).toBe(1);
  expect(tracesSampleRate("production")).toBe(0.2);
});
