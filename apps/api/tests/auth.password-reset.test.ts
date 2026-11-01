import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "#/app.ts";
import { eq } from "drizzle-orm";
import { account, user, verification } from "#/db/schema.ts";
import { buildDeps } from "#/deps.ts";
import { FakeMailerProvider } from "#/providers/resend/fake.ts";
import { loadConfig } from "#/services/config.ts";
import { MailerService } from "#/services/mailer.ts";

let mail: FakeMailerProvider;
let deps: ReturnType<typeof buildDeps>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  mail = new FakeMailerProvider();
  deps = buildDeps(loadConfig(), { mailer: new MailerService(mail) });
  app = createApp(deps);
});
afterEach(() => vi.useRealTimers());

const post = (path: string, body: unknown, cookie?: string) =>
  app.request(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const signUp = async (email: string) => cookieOf(await post("/sign-up/email", { email, password: "old-password", name: "U" }));
const signIn = (email: string, password: string) => post("/sign-in/email", { email, password });
const requestReset = (email: string) => post("/email-otp/request-password-reset", { email });
const reset = (email: string, otp: string, password = "new-password") => post("/email-otp/reset-password", { email, otp, password });
const sessionOf = async (cookie: string) =>
  (await app.request("/api/auth/get-session", { headers: { cookie } })).json();

function codeFrom(i = mail.sent.length - 1) {
  const code = mail.sent[i]?.text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error("no code in email");
  return code;
}
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

describe("Password reset", () => {
  // The email's content is covered in tests/emails/.
  it("emails exactly one 6-digit Reset code to an email-and-password User", async () => {
    await signUp("a@reset.test");
    const res = await requestReset("a@reset.test");
    expect(res.status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("a@reset.test");
    expect(mail.sent[0].text).toMatch(/\b\d{6}\b/);
  });

  it("answers an unknown email and a Google-only User exactly like a real one, and sends nothing", async () => {
    await signUp("real@reset.test");
    const real = await requestReset("real@reset.test");
    mail.sent.length = 0;

    deps.db.insert(user).values({ id: "g1", name: "G", email: "google@reset.test" }).run();
    deps.db
      .insert(account)
      .values({ id: "ga1", accountId: "google-sub", providerId: "google", userId: "g1", createdAt: new Date(), updatedAt: new Date() })
      .run();

    for (const email of ["nobody@reset.test", "google@reset.test"]) {
      const res = await requestReset(email);
      expect(res.status).toBe(real.status);
      expect(await res.json()).toEqual(await real.clone().json());
    }
    expect(mail.sent).toHaveLength(0);
  });

  it("a Google-only User can't gain a password, even with the stored code", async () => {
    deps.db.insert(user).values({ id: "g2", name: "G", email: "g2@reset.test" }).run();
    deps.db
      .insert(account)
      .values({ id: "ga2", accountId: "google-sub-2", providerId: "google", userId: "g2", createdAt: new Date(), updatedAt: new Date() })
      .run();
    await requestReset("g2@reset.test");
    const stored = deps.db.select().from(verification).where(eq(verification.identifier, "forget-password-otp-g2@reset.test")).get();
    const code = stored?.value.split(":")[0] ?? "123456";

    const res = await reset("g2@reset.test", code);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_OTP");
    expect((await signIn("g2@reset.test", "new-password")).status).toBe(401);
    expect(deps.db.select().from(account).where(eq(account.userId, "g2")).all()).toHaveLength(1);
  });

  it("the right code sets the new password, and signs out sessions from before the reset", async () => {
    const before = await signUp("b@reset.test");
    expect((await sessionOf(before))?.user.email).toBe("b@reset.test");
    await requestReset("b@reset.test");

    expect((await reset("b@reset.test", codeFrom())).status).toBe(200);

    expect((await signIn("b@reset.test", "new-password")).status).toBe(200);
    expect((await signIn("b@reset.test", "old-password")).status).toBe(401);
    expect(await sessionOf(before)).toBeNull();
  });

  it("after 3 wrong codes the right code fails too", async () => {
    await signUp("c@reset.test");
    await requestReset("c@reset.test");
    const code = codeFrom();
    for (let i = 0; i < 3; i++) {
      const res = await reset("c@reset.test", wrong(code));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_OTP");
    }
    const res = await reset("c@reset.test", code);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("TOO_MANY_ATTEMPTS");
    expect((await signIn("c@reset.test", "old-password")).status).toBe(200);
  });

  it("a code used after 5 minutes fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await signUp("d@reset.test");
    await requestReset("d@reset.test");
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1000);
    // better-auth hides expired rows, so this reads INVALID_OTP rather than OTP_EXPIRED.
    expect((await reset("d@reset.test", codeFrom())).status).toBe(400);
    expect((await signIn("d@reset.test", "new-password")).status).toBe(401);
  });

  it("rejects an invalid request body with 400", async () => {
    expect((await post("/email-otp/request-password-reset", {})).status).toBe(400);
    expect((await post("/email-otp/reset-password", { email: "x@reset.test" })).status).toBe(400);
  });

  it("OTP sign-in is not turned on", async () => {
    await signUp("e@reset.test");
    expect((await post("/email-otp/send-verification-otp", { email: "e@reset.test", type: "sign-in" })).status).toBe(404);
    expect((await post("/sign-in/email-otp", { email: "e@reset.test", otp: "123456" })).status).toBe(404);
    expect(mail.sent).toHaveLength(0);
  });
});
