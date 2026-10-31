import { beforeAll, describe, expect, it } from "vitest";
import type { app as App } from "./app.js";

let app: typeof App;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  ({ app } = await import("./app.js")); // import after env so db/auth pick it up
});

describe("api", () => {
  it("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
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
    expect((await session.json()).user.email).toBe(email);
  });
});
