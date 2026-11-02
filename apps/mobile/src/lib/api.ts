import * as Sentry from "@sentry/react-native";
import { authClient } from "./auth-client";

export const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const cookie = await authClient.getCookie();
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  // credentials "omit": "include" can clobber the Cookie header we set (better-auth Expo docs).
  const res = await fetch(`${BASE_URL}/${path.replace(/^\/+/, "")}`, { ...init, headers, credentials: "omit" });
  if (!res.ok) {
    const error = new Error(`${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
    // A 5xx is already in Sentry from the API; this event carries the same trace id, linking the two.
    if (res.status >= 500) Sentry.captureException(error);
    throw error;
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
