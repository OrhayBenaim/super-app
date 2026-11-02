import { afterEach, expect, it, vi } from "vitest";

// The fake keeps which span is active, so a test can tell where fetch and captureException ran.
const sentry = vi.hoisted(() => ({ active: undefined as object | undefined, span: { end: () => {} }, fetchedIn: [] as unknown[] }));
const captureException = vi.hoisted(() => vi.fn(() => sentry.active));
vi.mock("@sentry/react-native", () => ({
  captureException,
  startInactiveSpan: () => sentry.span,
  withActiveSpan: <T>(span: object, fn: () => T) => {
    const before = sentry.active;
    sentry.active = span;
    try {
      return fn();
    } finally {
      sentry.active = before;
    }
  },
}));
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

it("sends the request and reports its 5xx inside one span, so both stay in one trace across a screen change", async () => {
  const end = vi.spyOn(sentry.span, "end");
  vi.stubGlobal("fetch", async () => {
    sentry.fetchedIn.push(sentry.active);
    return new Response("boom", { status: 503 });
  });
  const { api } = await import("@/lib/api");
  await expect(api("/lists")).rejects.toThrow("503");
  expect(sentry.fetchedIn).toEqual([sentry.span]);
  expect(captureException).toHaveReturnedWith(sentry.span);
  expect(end).toHaveBeenCalledOnce();
});
