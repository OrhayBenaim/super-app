import { serve, type ServerType } from "@hono/node-server";
import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { sentryErrorHandler } from "#/providers/sentry/sentry.ts";

// Nothing listens on port 9; the event processor drops every event before it is sent anyway.
const errorHandler = sentryErrorHandler({ dsn: "http://key@127.0.0.1:9/1", environment: "test" });
const events: Sentry.Event[] = [];
Sentry.addEventProcessor((event) => {
  if (event.exception) events.push(event);
  return null;
});

// Same order as the real app: requireUser sets the user, then the route fails after an await.
const app = new Hono()
  .use(async (c, next) => {
    errorHandler.setUser(c.req.header("x-user") ?? "");
    await next();
  })
  .get("/boom", async () => {
    await new Promise((r) => setTimeout(r, 50));
    throw new Error("boom");
  })
  .onError((error, c) => {
    errorHandler.report(error);
    return c.text("internal", 500);
  });

let server: ServerType;
let url = "";
beforeAll(() => new Promise<void>((resolve) => {
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
    url = `http://127.0.0.1:${info.port}`;
    resolve();
  });
}));
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const trace = (n: string) => n.repeat(32);
const call = (user: string, traceId: string) =>
  fetch(`${url}/boom`, { headers: { "x-user": user, "sentry-trace": `${traceId}-${"b".repeat(16)}-1` } });

it("keeps each request's user and continues the caller's trace, even when requests overlap", async () => {
  const [a, b] = await Promise.all([call("dana", trace("1")), call("eli", trace("2"))]);
  expect([a.status, b.status]).toEqual([500, 500]);
  await vi.waitFor(() => expect(events).toHaveLength(2));
  const seen = events.map((e) => [e.user?.id, e.contexts?.trace?.trace_id]).sort();
  expect(seen).toEqual([["dana", trace("1")], ["eli", trace("2")]]);
});
