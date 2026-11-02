import { describe, expect, it } from "vitest";
import { buildDeps } from "#/deps.ts";
import { fakeErrorHandler } from "#/providers/fake-error-handler/fake.ts";
import { FakeMailerProvider } from "#/providers/resend/fake.ts";
import { loadConfig } from "#/services/config.ts";
import { MailerService } from "#/services/mailer.ts";

describe("buildDeps", () => {
  it("builds a MailerService by default", () => {
    expect(buildDeps(loadConfig()).mailer).toBeInstanceOf(MailerService);
  });

  it("takes a mailer override backed by the fake provider", async () => {
    const provider = new FakeMailerProvider();
    const mailer = new MailerService(provider);
    const deps = buildDeps(loadConfig(), { mailer });
    expect(deps.mailer).toBe(mailer);
    await deps.mailer.send({ to: "a@test.dev", subject: "s", text: "t" });
    expect(provider.sent).toEqual([{ to: "a@test.dev", subject: "s", text: "t" }]);
  });

  it("keeps the fake error handler when SENTRY_DSN is unset, so tests and local runs send nothing", () => {
    const config = loadConfig({ ...process.env, SENTRY_DSN: "" });
    expect(Object.keys(buildDeps(config).errorHandler).sort()).toEqual(Object.keys(fakeErrorHandler()).sort());
  });
});
