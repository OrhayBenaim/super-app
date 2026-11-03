import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "#/db/index.ts";
import { verification } from "#/db/schema.ts";
import { FakeMailerProvider } from "#/providers/resend/fake.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { MailerService } from "#/services/mailer.ts";
import { OtpService } from "#/services/otp.ts";
import { fakeClock } from "#/utils/clock.ts";

let clock: ReturnType<typeof fakeClock>;
let mail: FakeMailerProvider;
let errorHandler: ReturnType<typeof fakeErrorHandler>;
let db: Db;
let otp: OtpService;

beforeEach(() => {
  clock = fakeClock(new Date("2026-11-03T10:00:00Z"));
  mail = new FakeMailerProvider();
  errorHandler = fakeErrorHandler();
  db = openDb(":memory:");
  otp = new OtpService({ db, mailer: new MailerService(mail), clock, errorHandler });
});
afterEach(() => vi.restoreAllMocks());

const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

describe("OtpService", () => {
  it("creates a 6-digit code that verifies once", () => {
    const code = otp.create("password-reset", "a@otp.test");
    expect(code).toMatch(/^\d{6}$/);
    expect(otp.verify("password-reset", "a@otp.test", code)).toBe("ok");
    expect(otp.verify("password-reset", "a@otp.test", code)).toBe("expired");
  });

  it("check leaves a right code live and counts wrong tries like verify", () => {
    const code = otp.create("delete-data", "a@otp.test");
    expect(otp.check("delete-data", "a@otp.test", code)).toBe("ok");
    expect(otp.check("delete-data", "a@otp.test", wrong(code))).toBe("wrong");
    expect(otp.check("delete-data", "a@otp.test", code)).toBe("ok");
    expect(otp.check("delete-data", "a@otp.test", wrong(code))).toBe("wrong");
    expect(otp.check("delete-data", "a@otp.test", wrong(code))).toBe("tooManyTries");
    expect(otp.verify("delete-data", "a@otp.test", code)).toBe("expired");
  });

  it("keeps purposes and emails apart", () => {
    const code = otp.create("delete-data", "a@otp.test");
    expect(otp.verify("delete-account", "a@otp.test", code)).toBe("expired");
    expect(otp.verify("password-reset", "a@otp.test", code)).toBe("expired");
    expect(otp.verify("delete-data", "b@otp.test", code)).toBe("expired");
    expect(otp.verify("delete-data", "a@otp.test", code)).toBe("ok");
  });

  it("counts wrong tries, and the 3rd revokes the code", () => {
    const code = otp.create("password-reset", "a@otp.test");
    expect(otp.verify("password-reset", "a@otp.test", wrong(code))).toBe("wrong");
    expect(otp.verify("password-reset", "a@otp.test", "١٢٣٤٥٦")).toBe("wrong"); // 6 characters, 12 bytes
    expect(otp.verify("password-reset", "a@otp.test", wrong(code))).toBe("tooManyTries");
    expect(otp.verify("password-reset", "a@otp.test", code)).toBe("expired");
  });

  it("a new code replaces the old one and starts the count over", () => {
    const first = otp.create("password-reset", "a@otp.test");
    otp.verify("password-reset", "a@otp.test", wrong(first));
    otp.verify("password-reset", "a@otp.test", wrong(first));
    const second = otp.create("password-reset", "a@otp.test");
    if (first !== second) expect(otp.verify("password-reset", "a@otp.test", first)).toBe("wrong");
    expect(otp.verify("password-reset", "a@otp.test", second)).toBe("ok");
  });

  it("a code expires after 5 minutes", () => {
    const code = otp.create("delete-account", "a@otp.test");
    clock.advance(5 * 60_000);
    expect(otp.verify("delete-account", "a@otp.test", code)).toBe("expired");
  });

  it("creating a code deletes every expired one, so codes for unknown emails don't pile up", () => {
    otp.create("delete-data", "nobody@otp.test");
    clock.advance(5 * 60_000);
    otp.create("password-reset", "a@otp.test");
    expect(db.select({ id: verification.identifier }).from(verification).all()).toEqual([{ id: "otp:password-reset:a@otp.test" }]);
  });

  it("revoke kills the live code", () => {
    const code = otp.create("delete-account", "a@otp.test");
    otp.revoke("delete-account", "a@otp.test");
    expect(otp.verify("delete-account", "a@otp.test", code)).toBe("expired");
  });

  it("send does not wait for the mailer and reports a failed send", async () => {
    otp.send({ to: "a@otp.test", subject: "s", text: "t" });
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));

    mail.send = async () => {
      throw new Error("mail down");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    otp.send({ to: "a@otp.test", subject: "s", text: "t" });
    await vi.waitFor(() => expect(errorHandler.reported).toHaveLength(1));
  });
});
