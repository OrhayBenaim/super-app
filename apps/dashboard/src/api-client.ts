// The dashboard holds no data: every read and write goes to the api's private app (docs/adr/0005), typed from its routes.
import { hc } from "hono/client";
import type { createInternalApp } from "api/src/internal-app.ts";
import type { Config } from "#/services/config.ts";

export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>;

/** The private app's client with the SYNC_TOKEN bearer. Tests pass a `fetch` that calls the private app in-process. */
export function apiClient(config: Pick<Config, "API_URL" | "SYNC_TOKEN">, fetch: Fetch = globalThis.fetch) {
  return hc<ReturnType<typeof createInternalApp>>(config.API_URL, { fetch, headers: { Authorization: `Bearer ${config.SYNC_TOKEN}` } });
}

export type ApiClient = ReturnType<typeof apiClient>;

type Answer = { status: number; json(): Promise<unknown> };
type Body<R> = R extends { status: 200; json(): Promise<infer B> } ? B : never;

/** An api answer no route expects: a bug or a bad SYNC_TOKEN, which onError shows. */
export const unexpected = (res: { status: number }, call: string) => new Error(`api ${call} answered ${res.status}`);

/** The api's 200 body, or null when it has no such thing (404, or 400 for an id that names none). Anything else is a bug: onError shows it. */
export async function found<R extends Answer>(res: R, call: string): Promise<Body<R> | null> {
  if (res.status === 404 || res.status === 400) return null;
  if (res.status !== 200) throw unexpected(res, call);
  return (await res.json()) as Body<R>;
}
