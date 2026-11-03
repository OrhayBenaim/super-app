import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "#/app.ts";
import { listMembers, lists, session, user } from "#/db/schema.ts";
import { buildDeps } from "#/deps.ts";
import { FakeMailerProvider } from "#/providers/resend/fake.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { loadConfig } from "#/services/config.ts";
import { MailerService } from "#/services/mailer.ts";
import { fakeClock } from "#/utils/clock.ts";

const ORIGIN = "http://localhost:3000"; // BETTER_AUTH_URL in vitest.config.ts

let mail: FakeMailerProvider;
let clock: ReturnType<typeof fakeClock>;
let deps: ReturnType<typeof buildDeps>;
let app: ReturnType<typeof createApp>;

function setup(env: Record<string, string> = {}) {
  mail = new FakeMailerProvider();
  // Real time: better-auth's own session expiry reads Date.now(); only the OtpService and rate limits read the clock.
  clock = fakeClock(new Date());
  deps = buildDeps(loadConfig({ ...process.env, ...env }), { mailer: new MailerService(mail), clock, errorHandler: fakeErrorHandler() });
  app = createApp(deps);
}
beforeEach(() => setup());
afterEach(() => vi.restoreAllMocks());

const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

async function signUp(email: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password1234", name: "U" }),
  });
  return { cookie: cookieOf(res), id: ((await res.json()) as { user: { id: string } }).user.id };
}

/** The form body htmx posts. */
const form = (path: string, body: Record<string, string>, { cookie, origin = ORIGIN, ip }: { cookie?: string; origin?: string; ip?: string } = {}) =>
  app.request(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin, ...(cookie ? { cookie } : {}) },
      body: new URLSearchParams(body).toString(),
    },
    ip ? { incoming: { socket: { remoteAddress: ip } } } : undefined,
  );

const step = async (res: Response) => (await res.text()).match(/data-step="([^"]+)"/)?.[1];
const sendCode = (cookie: string, kind: string, extra: Record<string, string> = {}) => form("/deletion/code/send", { kind, ...extra }, { cookie });
const verify = (cookie: string, kind: string, code: string) => form("/deletion/code/verify", { kind, code }, { cookie });
const listsCall = (cookie: string, method = "GET", path = "", body?: unknown) =>
  app.request(`/api/lists${path}`, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

function codeFrom(i = mail.sent.length - 1) {
  const code = mail.sent[i]?.text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error("no code in email");
  return code;
}
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

/** a owns a List that b joined, and b owns a List that a joined. */
async function shared() {
  const a = await signUp("a@delete.test");
  const b = await signUp("b@delete.test");
  const aList: string = (await (await listsCall(a.cookie)).json())[0].id;
  const bList: string = (await (await listsCall(b.cookie)).json())[0].id;
  const invite = async (cookie: string, list: string) => (await (await listsCall(cookie, "POST", `/${list}/invite`)).json()).code;
  expect((await listsCall(b.cookie, "POST", "/join", { code: await invite(a.cookie, aList) })).status).toBe(200);
  expect((await listsCall(a.cookie, "POST", "/join", { code: await invite(b.cookie, bList) })).status).toBe(200);
  return { a, b, aList, bList };
}
const listIds = () => deps.db.select({ id: lists.id }).from(lists).all().map((l) => l.id);
const membersOf = (list: string) =>
  deps.db.select({ userId: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, list)).all().map((m) => m.userId);
const sessionWorks = async (cookie: string) => (await (await app.request("/api/auth/get-session", { headers: { cookie } })).json()) !== null;

describe("deletion page", () => {
  it.each(["/delete-account", "/delete-data"])("%s is a public Hebrew RTL page that loads htmx from the API", async (path) => {
    const res = await app.request(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    const page = await res.text();
    expect(page).toContain('<html lang="he" dir="rtl">');
    expect(page).toContain('<script src="/assets/htmx.min.js"></script>');
    expect(page).not.toMatch(/<script src="https?:/);
    expect(page).toContain('data-step="sign-in"');
    // htmx swaps nothing on a 429 or a network failure; the page says so instead.
    expect(page).toContain('hx-on::response-error="busy.hidden = false"');
    expect(page).toContain('hx-on::send-error="busy.hidden = false"');
    expect(page).toMatch(/<label for="email">/);
    expect(page).toMatch(/<label for="password">/);
    const htmx = await app.request("/assets/htmx.min.js");
    expect(htmx.status).toBe(200);
    expect(htmx.headers.get("content-type")).toMatch(/javascript/);
  });

  it("offers Google only when it is configured", async () => {
    expect(await (await app.request("/delete-account")).text()).not.toContain("/deletion/sign-in/google");
    setup({ GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret" });
    expect(await (await app.request("/delete-account")).text()).toContain("/deletion/sign-in/google");
  });

  it("signed in, goes straight to the account email, sign-out and both buttons", async () => {
    const { cookie } = await signUp("a@delete.test");
    const page = await (await app.request("/delete-data", { headers: { cookie } })).text();
    expect(page).toContain('data-step="choose"');
    expect(page).toContain("a@delete.test");
    expect(page).toContain('hx-post="/deletion/sign-out"');
    expect(page).toContain('value="account"');
    expect(page).toContain('value="data"');
  });

  it("shows an OAuth error that comes back to the page, and a no-account one by name", async () => {
    expect(await (await app.request("/delete-account?error=signup_disabled")).text()).toContain('data-error="noAccount"');
    expect(await (await app.request("/delete-account?error=state_mismatch")).text()).toContain('data-error="oauth"');
    expect(await (await app.request("/delete-account?error=<script>")).text()).not.toContain("<script>alert");
  });
});

describe("sign-in", () => {
  it("the right password reaches the signed-in step with a session cookie", async () => {
    await signUp("a@delete.test");
    const res = await form("/deletion/sign-in", { email: "a@delete.test", password: "password1234" });
    expect(res.status).toBe(200);
    const cookie = cookieOf(res);
    expect(await step(res)).toBe("choose");
    expect(await sessionWorks(cookie)).toBe(true);
  });

  it("a wrong password shows an error on the sign-in step and sets no cookie", async () => {
    await signUp("a@delete.test");
    for (const email of ["a@delete.test", "nobody@delete.test"]) {
      const res = await form("/deletion/sign-in", { email, password: "wrong-password" });
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie()).toEqual([]);
      const body = await res.text();
      expect(body).toContain('data-step="sign-in"');
      expect(body).toContain('data-error="wrongPassword"');
    }
  });

  it("never signs anyone up", async () => {
    await form("/deletion/sign-in", { email: "new@delete.test", password: "password1234" });
    expect(deps.db.select().from(user).all()).toEqual([]);
  });

  it("Google redirects through better-auth and comes back to the page it started on", async () => {
    setup({ GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret" });
    const res = await form("/deletion/sign-in/google", { page: "/delete-data" });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin).toBe("https://accounts.google.com");
    expect(to.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);
    expect(res.headers.getSetCookie().join()).toContain("state");
    // The callback's redirect targets come from the stored state; this one only names the page.
    expect((await form("/deletion/sign-in/google", { page: "https://evil.test" })).status).toBe(400);
  });

  it("Google and Apple never sign up implicitly; the app asks for sign-up explicitly", async () => {
    setup({ GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "g", APPLE_CLIENT_ID: "a", APPLE_CLIENT_SECRET: "a" });
    const providers = deps.auth.options.socialProviders as Record<string, { disableImplicitSignUp?: boolean }>;
    expect(providers.google?.disableImplicitSignUp).toBe(true);
    expect(providers.apple?.disableImplicitSignUp).toBe(true);
  });

  it("sign-out ends the session and shows the sign-in step", async () => {
    const { cookie } = await signUp("a@delete.test");
    const res = await form("/deletion/sign-out", {}, { cookie });
    expect(await step(res)).toBe("sign-in");
    expect(await sessionWorks(cookie)).toBe(false);
  });

  it("email sign-in keeps the sign-in limit: 10 a minute per client", async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await form("/deletion/sign-in", { email: "a@delete.test", password: "x" }, { ip: "203.0.113.7" })).status);
    expect(statuses.at(-2)).toBe(200);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("Deletion code", () => {
  it("the code endpoints answer 401 without a session", async () => {
    expect((await form("/deletion/code/send", { kind: "account" })).status).toBe(401);
    expect((await form("/deletion/code/verify", { kind: "account", code: "123456" })).status).toBe(401);
    expect((await app.request("/deletion/choose")).status).toBe(401);
    expect(mail.sent).toHaveLength(0);
  });

  it.each([
    ["account", "החשבון שלכם"],
    ["data", "החשבון נשאר"],
  ])("a %s button shows its warning and emails a 6-digit code to the session's User, whatever the body says", async (kind, warning) => {
    const { cookie } = await signUp("a@delete.test");
    const res = await sendCode(cookie, kind, { email: "attacker@delete.test" });
    const body = await res.text();
    expect(body).toContain('data-step="code"');
    expect(body).toContain(warning);
    expect(body).toMatch(/<label for="code">/);
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    expect(mail.sent[0]!.to).toBe("a@delete.test");
    expect(codeFrom()).toMatch(/^\d{6}$/);
  });

  it("a wrong code shows an error; the 3rd kills it and offers send again, which emails a new code", async () => {
    const { cookie, id } = await signUp("a@delete.test");
    await sendCode(cookie, "account");
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    const code = codeFrom();
    for (let i = 0; i < 2; i++) {
      const body = await (await verify(cookie, "account", wrong(code))).text();
      expect(body).toContain('data-error="wrong"');
      expect(body).not.toContain("send-again");
    }
    const third = await (await verify(cookie, "account", wrong(code))).text();
    expect(third).toContain('data-error="tooManyTries"');
    expect(third).toContain("send-again");
    expect(await (await verify(cookie, "account", code)).text()).toContain('data-error="expired"');

    await sendCode(cookie, "account");
    await vi.waitFor(() => expect(mail.sent).toHaveLength(2));
    expect(await step(await verify(cookie, "account", codeFrom()))).toBe("done");
    expect(deps.db.select().from(user).where(eq(user.id, id)).get()).toBeUndefined();
  });

  it("a code older than 5 minutes is rejected", async () => {
    const { cookie, id } = await signUp("a@delete.test");
    await sendCode(cookie, "account");
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    clock.advance(5 * 60_000);
    const body = await (await verify(cookie, "account", codeFrom())).text();
    expect(body).toContain('data-error="expired"');
    expect(body).toContain("send-again");
    expect(deps.db.select().from(user).where(eq(user.id, id)).get()).toBeDefined();
  });

  it("cancel goes back to the signed-in step and deletes nothing", async () => {
    const { cookie } = await signUp("a@delete.test");
    await listsCall(cookie);
    const body = await (await sendCode(cookie, "account")).text();
    expect(body).toContain('hx-get="/deletion/choose"');
    const res = await app.request("/deletion/choose", { headers: { cookie } });
    expect(await step(res)).toBe("choose");
    expect(await sessionWorks(cookie)).toBe(true);
    expect(listIds()).toHaveLength(1);
  });

  it("a code works only for the kind it was sent for", async () => {
    const { cookie } = await signUp("a@delete.test");
    await listsCall(cookie);
    await sendCode(cookie, "data");
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    expect(await (await verify(cookie, "account", codeFrom())).text()).toContain('data-error="expired"');
    expect(await sessionWorks(cookie)).toBe(true);

    await sendCode(cookie, "account");
    await vi.waitFor(() => expect(mail.sent).toHaveLength(2));
    // The Data deletion code is still live, so the Account deletion code is just a wrong one there.
    expect(await (await verify(cookie, "data", codeFrom())).text()).toContain('data-error="wrong"');
    expect(listIds()).toHaveLength(1);
  });

  it("a Reset code is no Deletion code, and a Deletion code is no Reset code", async () => {
    const { cookie } = await signUp("a@delete.test");
    const json = (path: string, body: unknown) =>
      app.request(`/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    await json("/email-otp/request-password-reset", { email: "a@delete.test" });
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    expect(await (await verify(cookie, "account", codeFrom())).text()).toContain('data-error="expired"');

    await sendCode(cookie, "account");
    await vi.waitFor(() => expect(mail.sent).toHaveLength(2));
    const reset = await json("/email-otp/reset-password", { email: "a@delete.test", otp: codeFrom(), password: "new-password" });
    expect(reset.status).toBe(400);
    expect(await sessionWorks(cookie)).toBe(true);
  });

  it("the code endpoints are limited to 5 a minute per client, like Reset codes", async () => {
    const { cookie } = await signUp("a@delete.test");
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await form("/deletion/code/verify", { kind: "account", code: "000000" }, { cookie, ip: "203.0.113.8" })).status);
    expect(statuses.at(-2)).toBe(200);
    expect(statuses.at(-1)).toBe(429);
  });

  it("invalid bodies answer 400", async () => {
    const { cookie } = await signUp("a@delete.test");
    expect((await form("/deletion/code/send", { kind: "everything" }, { cookie })).status).toBe(400);
    expect((await form("/deletion/code/send", {}, { cookie })).status).toBe(400);
    expect((await form("/deletion/code/verify", { kind: "account" }, { cookie })).status).toBe(400);
    expect((await form("/deletion/sign-in", { email: "a@delete.test" })).status).toBe(400);
    expect(mail.sent).toHaveLength(0);
  });

  it("refuses a cross-origin POST", async () => {
    const { cookie } = await signUp("a@delete.test");
    expect((await form("/deletion/code/send", { kind: "account" }, { cookie, origin: "https://evil.test" })).status).toBe(403);
    expect((await form("/deletion/sign-out", {}, { cookie, origin: "https://evil.test" })).status).toBe(403);
    expect(await sessionWorks(cookie)).toBe(true);
    expect(mail.sent).toHaveLength(0);
  });
});

describe("Account deletion", () => {
  it("removes the User, their owned Lists (for Members too), their memberships and sessions, and ends signed out", async () => {
    const { a, b, aList, bList } = await shared();
    await sendCode(a.cookie, "account");
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    const res = await verify(a.cookie, "account", codeFrom());
    expect(await step(res)).toBe("done");
    expect(res.headers.getSetCookie().join()).toMatch(/session_token=;/);

    expect(deps.db.select().from(user).where(eq(user.id, a.id)).get()).toBeUndefined();
    expect(deps.db.select().from(session).where(eq(session.userId, a.id)).all()).toEqual([]);
    expect(listIds()).toEqual([bList]);
    expect(listIds()).not.toContain(aList);
    expect(membersOf(bList)).toEqual([b.id]);
    expect(await sessionWorks(b.cookie)).toBe(true);
  });
});

describe("Data deletion", () => {
  it("removes the User's owned Lists (for Members too) and memberships; the User and their session stay", async () => {
    const { a, b, bList } = await shared();
    await sendCode(a.cookie, "data");
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    const res = await verify(a.cookie, "data", codeFrom());
    expect(await step(res)).toBe("done");
    expect(res.headers.getSetCookie()).toEqual([]);

    expect(listIds()).toEqual([bList]);
    expect(membersOf(bList)).toEqual([b.id]);
    expect(deps.db.select().from(user).where(eq(user.id, a.id)).get()).toBeDefined();
    expect(await sessionWorks(a.cookie)).toBe(true);
    expect(await step(await app.request("/delete-data", { headers: { cookie: a.cookie } }))).toBe("choose");
  });
});
