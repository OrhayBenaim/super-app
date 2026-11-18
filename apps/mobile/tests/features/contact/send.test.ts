import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react-native", () => ({ startInactiveSpan: () => ({ end() {} }), withActiveSpan: <T>(_s: object, fn: () => T) => fn(), captureException() {} }));
vi.mock("@/lib/auth-client", () => ({ authClient: { getCookie: async () => "grocer.session=abc" } }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "1.4.0" }));

import { canSend, contactError, sendContact } from "@/features/contact/send";

afterEach(() => vi.unstubAllGlobals());

describe("canSend", () => {
  it("needs a Topic and text that is not blank", () => {
    expect(canSend(null, "hello")).toBe(false);
    expect(canSend("bug", "  \n ")).toBe(false);
    expect(canSend("bug", " hello ")).toBe(true);
  });
});

describe("sendContact", () => {
  it("posts the Topic, trimmed text, app version and OS", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendContact("missingProduct", "  no milk found \n");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/contact$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ topic: "missingProduct", text: "no milk found", appVersion: "1.4.0", os: "ios" });
  });

  it("maps a 429 to tooMany and any other failure to failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    expect(contactError(await sendContact("bug", "x").catch((e) => e))).toBe("tooMany");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 502 })));
    expect(contactError(await sendContact("bug", "x").catch((e) => e))).toBe("failed");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(contactError(await sendContact("bug", "x").catch((e) => e))).toBe("failed");
  });
});
