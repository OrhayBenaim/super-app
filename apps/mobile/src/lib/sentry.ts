// The first import of app/_layout.tsx, so Sentry starts before the other modules and the first screen.
import * as Sentry from "@sentry/react-native";
import { tracesSampleRate } from "@grocer/shared/sentry";
import { useNavigationContainerRef } from "expo-router";
import { useEffect } from "react";
import { BASE_URL } from "@/lib/api";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const environment = __DEV__ ? "development" : "production";
// Starts a new trace on each screen change; without it one trace id would cover the whole app session.
const navigation = Sentry.reactNavigationIntegration();

Sentry.init({
  dsn,
  enabled: !!dsn, // unset DSN: the SDK stays off
  environment,
  tracesSampleRate: tracesSampleRate(environment),
  integrations: [navigation],
  // One project for API and mobile: filter by app. Tags label errors, attributes label logs.
  initialScope: { tags: { app: "mobile" }, attributes: { app: "mobile" } },
  // Adds sentry-trace and baggage headers to API calls only, so mobile and API events join one trace.
  tracePropagationTargets: [BASE_URL],
});

/** Lets Sentry follow expo-router's navigator, one trace per screen. Call in the root layout. */
export function useSentryNavigation() {
  const ref = useNavigationContainerRef();
  useEffect(() => {
    navigation.registerNavigationContainer(ref);
  }, [ref]);
}

/** Tags events with the better-auth user id, the same id the API sets in requireUser; cleared on sign-out. */
export function useSentryUser(userId: string | undefined) {
  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null);
  }, [userId]);
}
