import { afterEach, describe, expect, it, vi } from "vitest";
import { resendMailer } from "#/providers/resend/resend.ts";

afterEach(() => vi.unstubAllGlobals());

describe("resendMailer", () => {
  it("POSTs the email to Resend with the bearer key and the JSON body", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await resendMailer("re_key", "Grocer <no-reply@example.com>").send({
      to: "a@test.dev",
      subject: "Hi",
      text: "plain",
      html: "<p>html</p>",
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_key");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Grocer <no-reply@example.com>",
      to: "a@test.dev",
      subject: "Hi",
      text: "plain",
      html: "<p>html</p>",
    });
  });

  it("throws when the response isn't OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 422 })));
    await expect(resendMailer("k", "f@test.dev").send({ to: "a@test.dev", subject: "s", text: "t" })).rejects.toThrow(/422/);
  });
});
