import { useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { posthog, screenName, syncIdentity } from "./analytics";

/** Root layout hook: a $screen event per route, and the PostHog identity following the better-auth session. */
export function useAnalytics(userId: string | null) {
  const screen = screenName(useSegments());
  useEffect(() => void posthog.screen(screen), [screen]);
  const previous = useRef<string | null>(null);
  useEffect(() => {
    syncIdentity(previous.current, userId);
    previous.current = userId;
  }, [userId]);
}
