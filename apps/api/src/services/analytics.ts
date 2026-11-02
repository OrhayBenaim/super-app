/** Product analytics. distinctId is the better-auth user id, the same id the mobile app identifies with. */
export interface Analytics {
  capture(distinctId: string, event: string, properties?: Record<string, unknown>): void;
  /** Flushes queued events; call before the process exits. */
  shutdown(): Promise<void>;
}
