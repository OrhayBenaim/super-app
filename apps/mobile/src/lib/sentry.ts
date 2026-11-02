import * as Sentry from "@sentry/react-native";
import { BASE_URL } from "./api";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn, // unset DSN: the SDK stays off
  tracesSampleRate: __DEV__ ? 1 : 0.2,
  // Adds sentry-trace and baggage headers to API calls only, so mobile and API events join one trace.
  tracePropagationTargets: [BASE_URL],
});

export { Sentry };
