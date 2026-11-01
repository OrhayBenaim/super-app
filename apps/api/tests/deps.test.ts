import { describe, expect, it } from "vitest";
import { buildDeps } from "#/deps.ts";
import { fakeMailer } from "#/providers/resend/fake.ts";
import { loadConfig } from "#/services/config.ts";

describe("buildDeps", () => {
  it("takes a mailer override, and the fake keeps sent emails", async () => {
    const mailer = fakeMailer();
    const deps = buildDeps(loadConfig(), { mailer });
    expect(deps.mailer).toBe(mailer);
    await deps.mailer.send({ to: "a@test.dev", subject: "s", text: "t" });
    expect(mailer.sent).toEqual([{ to: "a@test.dev", subject: "s", text: "t" }]);
  });
});
