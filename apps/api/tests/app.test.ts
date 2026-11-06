import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { loadConfig } from "#/services/config.ts";

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  app = createApp(buildDeps(loadConfig()));
});

describe("api", () => {
  it("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /health is 503 when the database is gone", async () => {
    const deps = buildDeps(loadConfig());
    deps.db.$client.close();
    const res = await createApp(deps).request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error" });
  });

  it("gzips a response for a client that accepts it", async () => {
    const res = await app.request("/privacy", { headers: { "accept-encoding": "gzip" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
  });

  it("an unhandled error is a 500 and is reported", async () => {
    const errorHandler = fakeErrorHandler();
    const deps = buildDeps(loadConfig(), { errorHandler });
    const app = createApp(deps);
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "broken@example.com", password: "password1234", name: "Bo" }),
    });
    const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    deps.db.$client.close();
    const res = await app.request("/api/chains", { headers: { cookie } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
    expect(errorHandler.reported).toHaveLength(1);
  });

  it("413 for a body over 64 KB, before auth reads it", async () => {
    const body = JSON.stringify({ email: "big@example.com", password: "password1234", name: "x".repeat(70_000) });
    const res = await app.request("/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
  });

  it("signs up with email and reads the session back", async () => {
    const email = "dana@example.com";
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password1234", name: "Dana" }),
    });
    expect(signUp.status).toBe(200);
    const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect(cookie).toContain("session_token");

    const session = await app.request("/api/auth/get-session", { headers: { cookie } });
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(email);
  });
});
