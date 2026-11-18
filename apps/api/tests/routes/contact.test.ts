import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { FakeMailerProvider } from "#/providers/resend/fake.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { loadConfig } from "#/services/config.ts";
import { MailerService, type MailerProvider } from "#/services/mailer.ts";
import { fakeClock } from "#/utils/clock.ts";

let mail: FakeMailerProvider;
let errors: ReturnType<typeof fakeErrorHandler>;
let clock: ReturnType<typeof fakeClock>;

const config = () => loadConfig({ ...process.env, SUPPORT_EMAIL: "support@grocer.test" });
const valid = { topic: "bug", text: "The list will not load", appVersion: "1.6.0", os: "ios" };

async function setup(provider: MailerProvider) {
  const app = createApp(buildDeps(config(), { mailer: new MailerService(provider), errorHandler: errors, clock }));
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "u@contact.test", password: "password-123", name: "U" }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  // app.request() has no socket; the rate limiter keys on it.
  const send = (body: unknown, headers: Record<string, string> = { cookie }) =>
    app.request(
      "/api/contact",
      { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) },
      { incoming: { socket: { remoteAddress: "10.0.0.1" } } },
    );
  return send;
}

beforeEach(() => {
  mail = new FakeMailerProvider();
  errors = fakeErrorHandler();
  clock = fakeClock(new Date("2026-11-02T10:00:00Z"));
});

describe("POST /api/contact", () => {
  it("is 401 when signed out, and sends nothing", async () => {
    const send = await setup(mail);
    expect((await send(valid, {})).status).toBe(401);
    expect(mail.sent).toHaveLength(0);
  });

  it("is 400 for every invalid body, and sends nothing", async () => {
    const send = await setup(mail);
    const bad: unknown[] = [
      { ...valid, topic: "other" },
      { ...valid, topic: undefined },
      { ...valid, text: "" },
      { ...valid, text: " \n\t " },
      { ...valid, text: "x".repeat(2001) },
      { ...valid, text: 5 },
      { ...valid, appVersion: "" },
      { ...valid, appVersion: "1".repeat(33) },
      { ...valid, appVersion: undefined },
      { ...valid, os: "windows" },
      { ...valid, os: undefined },
    ];
    for (const body of bad) {
      expect((await send(body)).status, JSON.stringify(body)).toBe(400);
      clock.advance(60 * 60_000); // invalid requests count towards the hourly limit too
    }
    expect(mail.sent).toHaveLength(0);
  });

  it("accepts text of exactly 2000 characters", async () => {
    const send = await setup(mail);
    expect((await send({ ...valid, text: "x".repeat(2000) })).status).toBe(204);
  });

  it("sends one plain-text email to support, replyable to the account email", async () => {
    const send = await setup(mail);
    const res = await send({ ...valid, topic: "missingSupermarket", text: "  Add Yochananof\nin Haifa  ", os: "android", email: "evil@x.test" });
    expect(res.status).toBe(204);
    expect(mail.sent).toHaveLength(1);
    const [email] = mail.sent;
    expect(email.to).toBe("support@grocer.test");
    expect(email.replyTo).toBe("u@contact.test");
    expect(email.html).toBeUndefined();
    expect(email.subject).toBe("[Grocer] Missing supermarket: Add Yochananof in Haifa");
    expect(email.text).toBe("Add Yochananof\nin Haifa\n\n--\nu@contact.test\nApp version: 1.6.0\nOS: android");
  });

  it("cuts the subject preview at 60 characters", async () => {
    const send = await setup(mail);
    await send({ ...valid, text: "a".repeat(100) });
    expect(mail.sent[0].subject).toBe(`[Grocer] Bug: ${"a".repeat(60)}`);
  });

  it("allows 5 messages an hour per IP, then 429, and lets the client back after the window", async () => {
    const send = await setup(mail);
    for (let i = 0; i < 5; i++) expect((await send(valid)).status).toBe(204);
    expect((await send(valid)).status).toBe(429);
    expect(mail.sent).toHaveLength(5);
    clock.advance(60 * 60_000);
    expect((await send(valid)).status).toBe(204);
  });

  it("reports a mailer failure to the error handler and answers 502", async () => {
    const boom = new Error("resend down");
    const send = await setup({ send: () => Promise.reject(boom) });
    expect((await send(valid)).status).toBe(502);
    expect(errors.reported).toContain(boom);
  });
});
