/** Product analytics. distinctId is the better-auth user id, the same id the mobile app identifies with. */
/** Server-side events; the mobile app captures the rest under the same distinct id. */
export const AnalyticsEvents = { listShared: "list_shared", listJoined: "list_joined" } as const;
export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

export interface Analytics {
  capture(distinctId: string, event: AnalyticsEvent, properties?: Record<string, unknown>): void;
  /** Flushes queued events; call before the process exits. */
  shutdown(): Promise<void>;
}
