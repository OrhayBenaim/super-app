import { afterEach, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/react-native", () => ({ captureException }));
vi.mock("@/lib/auth-client", () => ({ authClient: { getCookie: async () => "grocer.session=abc" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  captureException.mockClear();
});

it("joins base URL and path, sends the auth cookie, parses JSON", async () => {
  vi.stubEnv("EXPO_PUBLIC_API_URL", "http://api.test/");
  const fetchMock = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  const { api } = await import("@/lib/api");

  expect(await api("/health")).toEqual({ ok: true });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("http://api.test/health");
  expect(new Headers(init.headers).get("Cookie")).toBe("grocer.session=abc");
});

it("throws on non-2xx", async () => {
  vi.stubGlobal("fetch", async () => new Response("nope", { status: 401 }));
  const { api } = await import("@/lib/api");
  await expect(api("/me")).rejects.toThrow("401");
});

it("sends a server error to Sentry, so it shares a trace with the API's event", async () => {
  vi.stubGlobal("fetch", async () => new Response("boom", { status: 500 }));
  const { api } = await import("@/lib/api");
  await expect(api("/lists")).rejects.toThrow("500");
  expect(captureException).toHaveBeenCalledOnce();
});

it("does not send a client error to Sentry", async () => {
  vi.stubGlobal("fetch", async () => new Response("nope", { status: 404 }));
  const { api } = await import("@/lib/api");
  await expect(api("/lists/x")).rejects.toThrow("404");
  expect(captureException).not.toHaveBeenCalled();
});
