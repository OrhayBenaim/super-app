import type { Analytics, AnalyticsEvent } from "#/services/analytics.ts";

export type Captured = { distinctId: string; event: AnalyticsEvent; properties?: Record<string, unknown> };

/** Keeps captured events in memory for tests; also the no-op when POSTHOG_KEY is unset. */
export function fakeAnalytics() {
  const captured: Captured[] = [];
  const fake = {
    captured,
    capture(distinctId: string, event: AnalyticsEvent, properties?: Record<string, unknown>) {
      captured.push({ distinctId, event, properties });
      if (captured.length > 100) captured.shift(); // bounded: deps.ts uses this fake in production too
    },
    async shutdown() {},
  };
  return fake satisfies Analytics;
}
