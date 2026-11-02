import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { MAX_CLIENTS } from "#/middleware.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

function setup(env: Record<string, string> = {}) {
  const clock = fakeClock(new Date("2026-11-02T10:00:00Z"));
  const app = createApp(buildDeps(loadConfig({ ...process.env, ...env }), { clock }));
  // app.request() has no socket; @hono/node-server puts the client's socket on env.incoming.
  const from = (ip: string, path: string, headers: Record<string, string> = {}) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" }, { incoming: { socket: { remoteAddress: ip } } });
  return { clock, from };
}

describe("rateLimit", () => {
  it("allows 5 Password reset requests a minute per client, then 429 with Retry-After", async () => {
    const { from } = setup();
    for (let i = 0; i < 5; i++) expect((await from("10.0.0.1", "/api/auth/email-otp/request-password-reset")).status).not.toBe(429);
    const res = await from("10.0.0.1", "/api/auth/email-otp/reset-password");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await from("10.0.0.2", "/api/auth/email-otp/request-password-reset")).status).not.toBe(429);
  });

  it("lets the client back in once the window has passed", async () => {
    const { clock, from } = setup();
    for (let i = 0; i < 6; i++) await from("10.0.0.1", "/api/auth/email-otp/request-password-reset");
    clock.advance(60_000);
    expect((await from("10.0.0.1", "/api/auth/email-otp/request-password-reset")).status).not.toBe(429);
  });

  it("limits sign-in attempts", async () => {
    const { from } = setup();
    for (let i = 0; i < 10; i++) expect((await from("10.0.0.1", "/api/auth/sign-in/email")).status).not.toBe(429);
    expect((await from("10.0.0.1", "/api/auth/sign-in/email")).status).toBe(429);
  });

  it("covers every route with a looser limit", async () => {
    const { from } = setup();
    for (let i = 0; i < 300; i++) await from("10.0.0.1", "/health");
    expect((await from("10.0.0.1", "/health")).status).toBe(429);
  });

  it("keeps limiting tracked clients once MAX_CLIENTS addresses are stored, and lets new ones through", async () => {
    const { from } = setup();
    for (let i = 0; i < 300; i++) await from("10.0.0.1", "/health");
    for (let i = 1; i < MAX_CLIENTS; i++) await from(`10.1.${i >> 8}.${i & 255}`, "/health");
    expect((await from("10.0.0.1", "/health")).status).toBe(429);
    for (let i = 0; i < 300; i++) await from("10.2.0.1", "/health");
    expect((await from("10.2.0.1", "/health")).status).not.toBe(429);
  });

  it("ignores X-Forwarded-For unless TRUST_PROXY is set, then keys by the last hop", async () => {
    const direct = setup();
    for (let i = 0; i < 6; i++) await direct.from("10.0.0.1", "/api/auth/email-otp/request-password-reset", { "x-forwarded-for": `1.1.1.${i}` });
    expect((await direct.from("10.0.0.1", "/api/auth/email-otp/request-password-reset", { "x-forwarded-for": "9.9.9.9" })).status).toBe(429);

    const proxied = setup({ TRUST_PROXY: "true" });
    for (let i = 0; i < 6; i++) await proxied.from("10.0.0.1", "/api/auth/email-otp/request-password-reset", { "x-forwarded-for": `spoofed, 2.2.2.${i}` });
    expect((await proxied.from("10.0.0.1", "/api/auth/email-otp/request-password-reset", { "x-forwarded-for": "2.2.2.200" })).status).not.toBe(429);
  });
});

describe("requireUser", () => {
  it("tags error reports with the signed-in user's id", async () => {
    const errorHandler = fakeErrorHandler();
    const deps = buildDeps(loadConfig(), { errorHandler });
    const app = createApp(deps);
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dana@example.com", password: "password1234", name: "Dana" }),
    });
    const { user } = (await signUp.json()) as { user: { id: string } };
    const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect((await app.request("/api/lists", { headers: { cookie } })).status).toBe(200);
    expect(errorHandler.user).toBe(user.id);
  });
});
