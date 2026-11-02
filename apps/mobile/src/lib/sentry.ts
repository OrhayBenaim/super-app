// Imported by app/_layout.tsx, so Sentry starts before the first screen renders.
import * as Sentry from "@sentry/react-native";
import { useEffect } from "react";
import { BASE_URL } from "@/lib/api";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn, // unset DSN: the SDK stays off
  tracesSampleRate: __DEV__ ? 1 : 0.2,
  initialScope: { tags: { app: "mobile" } }, // one project for API and mobile: filter by app
  // Adds sentry-trace and baggage headers to API calls only, so mobile and API events join one trace.
  tracePropagationTargets: [BASE_URL],
});

/** Tags events with the better-auth user id, the same id the API sets in requireUser; cleared on sign-out. */
export function useSentryUser(userId: string | undefined) {
  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null);
  }, [userId]);
}
