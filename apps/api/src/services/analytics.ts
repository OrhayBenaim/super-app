/** Product analytics. distinctId is the better-auth user id, the same id the mobile app identifies with. */
/** Server-side events; the mobile app captures the rest under the same distinct id. */
export type AnalyticsEvent = "list_shared" | "list_joined";

export interface Analytics {
  capture(distinctId: string, event: AnalyticsEvent, properties?: Record<string, unknown>): void;
  /** Flushes queued events; call before the process exits. */
  shutdown(): Promise<void>;
}
