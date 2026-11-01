import { describe, expect, it } from "vitest";
import { FakeMailerProvider } from "#/providers/resend/fake.ts";
import { MailerService, type MailerProvider } from "#/services/mailer.ts";

describe("MailerService", () => {
  it("sends through its provider", async () => {
    const provider = new FakeMailerProvider();
    await new MailerService(provider).send({ to: "a@test.dev", subject: "s", text: "t", html: "<p>h</p>" });
    expect(provider.sent).toEqual([{ to: "a@test.dev", subject: "s", text: "t", html: "<p>h</p>" }]);
  });

  it("passes a provider failure up", async () => {
    const failing: MailerProvider = { send: async () => Promise.reject(new Error("down")) };
    await expect(new MailerService(failing).send({ to: "a@test.dev", subject: "s", text: "t" })).rejects.toThrow("down");
  });
});
