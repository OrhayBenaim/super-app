import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "#/app.ts";
import { account, listMembers, lists, session, user } from "#/db/schema.ts";
import { buildDeps } from "#/deps.ts";
import { FakeMailerProvider } from "#/providers/resend/fake.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { loadConfig } from "#/services/config.ts";
import { MailerService } from "#/services/mailer.ts";
import { fakeClock } from "#/utils/clock.ts";

const MINUTE = 60_000;

let mail: FakeMailerProvider;
let clock: ReturnType<typeof fakeClock>;
let errors: ReturnType<typeof fakeErrorHandler>;
let deps: ReturnType<typeof buildDeps>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  mail = new FakeMailerProvider();
  clock = fakeClock(new Date());
  errors = fakeErrorHandler();
  deps = buildDeps(loadConfig(), { mailer: new MailerService(mail), clock, errorHandler: errors });
  app = createApp(deps);
});

// The form bodies htmx posts.
const form = (path: string, fields: Record<string, string>, env?: object) =>
  app.request(`/deletion/${path}`, { method: "POST", body: new URLSearchParams(fields) }, env);
const send = (kind: string, email: string) => form("send", { kind, email });
const verify = (kind: string, email: string, code: string) => form("verify", { kind, email, code });
const confirm = (kind: string, token: string) => form("confirm", { kind, token });

const stepOf = (page: string) => page.match(/data-step="(\w+)"/)?.[1];
const errorOf = (page: string) => page.match(/data-error="(\w+)"/)?.[1];
const tokenOf = (page: string) => {
  const token = page.match(/name="token" value="([^"]+)"/)?.[1];
  if (!token) throw new Error("no token in page");
  return token;
};
function codeFrom(i = mail.sent.length - 1) {
  const code = mail.sent[i]?.text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error("no code in email");
  return code;
}
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");
const flush = () => new Promise((r) => setTimeout(r, 0)); // the code email is sent without awaiting

const authPost = (path: string, body: unknown, cookie?: string) =>
  app.request(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
async function signUp(email: string) {
  const res = await authPost("/sign-up/email", { email, password: "password1234", name: "U" });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
const listsOf = async (cookie: string) => {
  const res = await app.request("/api/lists", { headers: { cookie } });
  return { status: res.status, lists: res.ok ? ((await res.json()) as { id: string }[]) : [] };
};
const userId = (email: string) => deps.db.select({ id: user.id }).from(user).where(eq(user.email, email)).get()?.id;

/** Runs the flow up to the warning step and returns the confirmation token. */
async function tokenFor(kind: string, email: string) {
  await send(kind, email);
  await flush();
  const page = await (await verify(kind, email, codeFrom())).text();
  expect(stepOf(page)).toBe("warning");
  return tokenOf(page);
}

describe("deletion pages", () => {
  it.each(["/delete-account", "/delete-data"])("%s is a public Hebrew RTL page on the email step, with its own htmx", async (path) => {
    const res = await app.request(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    const page = await res.text();
    expect(page).toContain('<html lang="he" dir="rtl">');
    expect(stepOf(page)).toBe("email");
    expect(page).toContain('<script src="/assets/htmx.min.js"');
    expect(page).not.toMatch(/<script[^>]+src="https?:/);

    const js = await app.request("/assets/htmx.min.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toMatch(/javascript/);
  });

  it("each page names its own kind in its forms", async () => {
    expect(await (await app.request("/delete-account")).text()).toContain('name="kind" value="account"');
    expect(await (await app.request("/delete-data")).text()).toContain('name="kind" value="data"');
  });
});

describe("Deletion code", () => {
  it("emails a 6-digit code to a User and shows the code step", async () => {
    await signUp("a@del.test");
    const res = await send("account", "A@Del.test ");
    expect(res.status).toBe(200);
    expect(stepOf(await res.text())).toBe("code");
    await flush();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe("a@del.test");
    expect(mail.sent[0]!.text).toMatch(/\b\d{6}\b/);
  });

  it("answers an unknown email exactly like a real one, and sends nothing", async () => {
    await signUp("real@del.test");
    const real = (await (await send("account", "real@del.test")).text()).replaceAll("real@del.test", "EMAIL");
    await flush();
    mail.sent.length = 0;

    const unknown = (await (await send("account", "nobody@del.test")).text()).replaceAll("nobody@del.test", "EMAIL");
    await flush();
    expect(unknown).toBe(real);
    expect(mail.sent).toHaveLength(0);
  });

  it("a Google-only User (no password) gets a code", async () => {
    deps.db.insert(user).values({ id: "g1", name: "G", email: "google@del.test" }).run();
    deps.db
      .insert(account)
      .values({ id: "ga1", accountId: "google-sub", providerId: "google", userId: "g1", createdAt: new Date(), updatedAt: new Date() })
      .run();
    await send("data", "google@del.test");
    await flush();
    expect(mail.sent.map((m) => m.to)).toEqual(["google@del.test"]);
  });

  it("a failed send is reported, and the visitor still sees the code step", async () => {
    await signUp("fail@del.test");
    mail.send = async () => {
      throw new Error("mail down");
    };
    const res = await send("account", "fail@del.test");
    expect(stepOf(await res.text())).toBe("code");
    await flush();
    expect(errors.reported).toHaveLength(1);
  });

  it("a wrong code shows an error on the code step, and the right code still works after it", async () => {
    await signUp("w@del.test");
    await send("account", "w@del.test");
    await flush();
    const code = codeFrom();

    const page = await (await verify("account", "w@del.test", wrong(code))).text();
    expect(stepOf(page)).toBe("code");
    expect(errorOf(page)).toBe("wrong");
    expect(page).toContain('role="alert"');

    expect(stepOf(await (await verify("account", "w@del.test", code)).text())).toBe("warning");
  });

  it("the 3rd wrong try kills the code and offers send again, which sends a new code", async () => {
    await signUp("t@del.test");
    await send("account", "t@del.test");
    await flush();
    const code = codeFrom();

    for (let i = 0; i < 2; i++) expect(errorOf(await (await verify("account", "t@del.test", wrong(code))).text())).toBe("wrong");
    const third = await (await verify("account", "t@del.test", wrong(code))).text();
    expect(errorOf(third)).toBe("tooManyTries");
    expect(third).toContain('hx-post="/deletion/send"');
    expect(third).toContain('name="email" value="t@del.test"');

    expect(errorOf(await (await verify("account", "t@del.test", code)).text())).toBe("expired");

    expect(stepOf(await (await send("account", "t@del.test")).text())).toBe("code");
    await flush();
    expect(mail.sent).toHaveLength(2);
    expect(stepOf(await (await verify("account", "t@del.test", codeFrom())).text())).toBe("warning");
  });

  it("a multi-byte code of the right length is just a wrong try", async () => {
    await signUp("u@del.test");
    await send("account", "u@del.test");
    await flush();
    const res = await verify("account", "u@del.test", "١٢٣٤٥٦"); // Arabic-Indic digits: 6 characters, 12 bytes
    expect(res.status).toBe(200);
    expect(errorOf(await res.text())).toBe("wrong");
  });

  it("rejects a code older than 5 minutes", async () => {
    await signUp("e@del.test");
    await send("account", "e@del.test");
    await flush();
    clock.advance(5 * MINUTE + 1);
    const page = await (await verify("account", "e@del.test", codeFrom())).text();
    expect(errorOf(page)).toBe("expired");
    expect(page).toContain('hx-post="/deletion/send"');
  });

  it("a code is used up by its first correct try", async () => {
    await signUp("once@del.test");
    await send("account", "once@del.test");
    await flush();
    const code = codeFrom();
    expect(stepOf(await (await verify("account", "once@del.test", code)).text())).toBe("warning");
    expect(errorOf(await (await verify("account", "once@del.test", code)).text())).toBe("expired");
  });

  it("a Data deletion code fails on the Delete account page", async () => {
    await signUp("k@del.test");
    await send("data", "k@del.test");
    await flush();
    expect(errorOf(await (await verify("account", "k@del.test", codeFrom())).text())).toBe("expired");
  });

  it("a Reset code fails here, and a Deletion code fails at Password reset", async () => {
    await signUp("r@del.test");
    await authPost("/email-otp/request-password-reset", { email: "r@del.test" });
    await flush();
    const resetCode = codeFrom();
    expect(stepOf(await (await verify("account", "r@del.test", resetCode)).text())).not.toBe("warning");

    await send("account", "r@del.test");
    await flush();
    const deletionCode = codeFrom();
    expect(deletionCode).not.toBe(resetCode); // 1 in a million; a clash would make the second half meaningless
    const res = await authPost("/email-otp/reset-password", { email: "r@del.test", otp: deletionCode, password: "new-password" });
    expect(res.status).toBe(400);
  });
});

describe("confirmation token", () => {
  it("an expired token sends the User back to the email step and is reported", async () => {
    await signUp("x@del.test");
    const token = await tokenFor("account", "x@del.test");
    clock.advance(3 * MINUTE + 1000);

    const page = await (await confirm("account", token)).text();
    expect(stepOf(page)).toBe("email");
    expect(errorOf(page)).toBe("expiredToken");
    expect(errors.reported).toHaveLength(1);
    expect(userId("x@del.test")).toBeDefined();
  });

  it("a token deletes once: a replay is rejected", async () => {
    const cookie = await signUp("once@tok.test");
    const token = await tokenFor("data", "once@tok.test");
    expect(stepOf(await (await confirm("data", token)).text())).toBe("done");
    const [fresh] = (await listsOf(cookie)).lists; // the default List an empty account gets
    const replay = await (await confirm("data", token)).text();
    expect(errorOf(replay)).toBe("invalidToken");
    expect((await listsOf(cookie)).lists.map((l) => l.id)).toEqual([fresh!.id]);
  });

  it("rejects a tampered token, and one issued for the other kind", async () => {
    await signUp("y@del.test");
    const token = await tokenFor("data", "y@del.test");
    const [head, body, sig] = token.split(".");
    const swapped = Buffer.from(Buffer.from(body!, "base64url").toString().replace("y@del.test", "z@del.test")).toString("base64url");

    for (const [kind, t] of [["data", `${head}.${swapped}.${sig}`], ["data", "nonsense"], ["account", token]] as const) {
      const page = await (await confirm(kind, t)).text();
      expect(stepOf(page)).toBe("email");
      expect(errorOf(page)).toBe("invalidToken");
    }
    expect(errors.reported).toHaveLength(0);
    expect(userId("y@del.test")).toBeDefined();
  });
});

describe("deleting", () => {
  /** a owns a List b joined; b owns a List a joined and b added an item to. */
  async function twoUsersSharing() {
    const a = await signUp("a@share.test");
    const b = await signUp("b@share.test");
    const [aList] = (await listsOf(a)).lists;
    const [bList] = (await listsOf(b)).lists;
    const invite = async (cookie: string, id: string) =>
      (await (await app.request(`/api/lists/${id}/invite`, { method: "POST", headers: { cookie } })).json()).code;
    const join = (cookie: string, code: string) =>
      app.request("/api/lists/join", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ code }) });
    await join(b, await invite(a, aList!.id));
    await join(a, await invite(b, bList!.id));
    return { a, b, aList: aList!.id, bList: bList!.id };
  }
  const membersOf = (listId: string) => deps.db.select().from(listMembers).where(eq(listMembers.listId, listId)).all().map((m) => m.userId);

  it("Account deletion removes the User, their sessions, their owned Lists (for Members too) and their memberships", async () => {
    const { a, b, aList, bList } = await twoUsersSharing();
    const aId = userId("a@share.test")!;
    const page = await (await confirm("account", await tokenFor("account", "a@share.test"))).text();
    expect(stepOf(page)).toBe("done");

    expect(userId("a@share.test")).toBeUndefined();
    expect(deps.db.select().from(session).where(eq(session.userId, aId)).all()).toHaveLength(0);
    expect((await listsOf(a)).status).toBe(401);
    expect(deps.db.select().from(lists).where(eq(lists.id, aList)).all()).toHaveLength(0);
    expect((await listsOf(b)).lists.map((l) => l.id)).toEqual([bList]);
    expect(membersOf(bList)).toEqual([userId("b@share.test")]);
  });

  it("Data deletion removes the same Lists and memberships, and the User keeps their account and session", async () => {
    const { a, b, aList, bList } = await twoUsersSharing();
    const aId = userId("a@share.test")!;
    const page = await (await confirm("data", await tokenFor("data", "a@share.test"))).text();
    expect(stepOf(page)).toBe("done");

    expect(userId("a@share.test")).toBe(aId);
    const after = await listsOf(a); // still signed in; the lists route gives an empty account a fresh default List
    expect(after.status).toBe(200);
    expect(after.lists.map((l) => l.id)).not.toContain(aList);
    expect(after.lists.map((l) => l.id)).not.toContain(bList);
    expect(deps.db.select().from(lists).where(eq(lists.id, aList)).all()).toHaveLength(0);
    expect((await listsOf(b)).lists.map((l) => l.id)).toEqual([bList]);
    expect(membersOf(bList)).toEqual([userId("b@share.test")]);
  });
});

describe("validation and limits", () => {
  it.each([
    ["send", { kind: "account" }],
    ["send", { kind: "account", email: "not-an-email" }],
    ["send", { kind: "everything", email: "a@del.test" }],
    ["verify", { kind: "account", email: "a@del.test" }],
    ["verify", { kind: "nope", email: "a@del.test", code: "123456" }],
    ["confirm", { kind: "account" }],
    ["confirm", { kind: "user", token: "t" }],
  ])("POST /deletion/%s with %o is a 400", async (path, fields) => {
    expect((await form(path, fields)).status).toBe(400);
  });

  it("the step endpoints share the strict per-IP limit of Password reset", async () => {
    const env = { incoming: { socket: { remoteAddress: "203.0.113.7" } } };
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await form("send", { kind: "data", email: `n${i}@del.test` }, env)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await app.request("/delete-data", {}, env)).status).toBe(200);
  });
});
