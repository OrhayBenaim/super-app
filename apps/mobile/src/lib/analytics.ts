import { PostHog } from "posthog-react-native";

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;

// Without a key (dev, tests) the client is disabled and every call is a no-op. Session replay stays off.
const posthog = new PostHog(key ?? "", {
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
  disabled: !key,
  captureAppLifecycleEvents: true,
});

// list_shared and list_joined are captured by the API, under the same user id.
type Event = "tap" | "list_item_added" | "list_item_checked" | "compare_viewed" | "compare_store_selected" | "geofence_triggered";

/** Every analytics call in the app goes through this module; nothing else imports posthog-react-native. */
export const screen = (name: string) => posthog.screen(name);
export const flush = () => posthog.flush();

/** Never pass names, emails or free text: the user id is the only personal data we send. */
export const track = (event: Event, properties?: Record<string, string | number | boolean>) => posthog.capture(event, properties);

/** identify() merges the anonymous pre-sign-in events into the user; reset() starts a new anonymous id. */
export function syncIdentity(previousId: string | null, userId: string | null) {
  if (userId === previousId) return;
  if (previousId) posthog.reset();
  if (userId) posthog.identify(userId);
}

/** Route pattern, not the URL: "/join/[code]" keeps invite codes and ids out of PostHog. */
export const screenName = (segments: string[]) => "/" + segments.filter((s) => !s.startsWith("(")).join("/");
