import { PostHog } from "posthog-node";
import type { Analytics } from "#/services/analytics.ts";

export function posthogAnalytics(apiKey: string, host: string): Analytics {
  const client = new PostHog(apiKey, { host });
  return {
    capture: (distinctId, event, properties) => client.capture({ distinctId, event, properties }),
    shutdown: () => client.shutdown(),
  };
}
