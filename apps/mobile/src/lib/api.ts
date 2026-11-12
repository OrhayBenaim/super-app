import * as Sentry from "@sentry/react-native";
import { ApiError } from "./api-error";
import { authClient } from "./auth-client";

export const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const cookie = await authClient.getCookie();
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const method = init.method ?? "GET";
  // One span per call: the request's sentry-trace header and a 5xx report both come from it, so they share a
  // trace even when a screen change starts a new one while the request is in flight.
  const span = Sentry.startInactiveSpan({ name: `api ${method} ${path}` });
  try {
    // credentials "omit": "include" can clobber the Cookie header we set (better-auth Expo docs).
    const res = await Sentry.withActiveSpan(span, () =>
      fetch(`${BASE_URL}/${path.replace(/^\/+/, "")}`, { ...init, headers, credentials: "omit" }),
    );
    if (!res.ok) {
      const error = new ApiError(`${method} ${path} failed: ${res.status} ${await res.text()}`, res.status);
      // The API already reported this 5xx in the same trace; this event links the mobile side to it.
      if (res.status >= 500) Sentry.withActiveSpan(span, () => Sentry.captureException(error));
      throw error;
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  } finally {
    span.end();
  }
}
