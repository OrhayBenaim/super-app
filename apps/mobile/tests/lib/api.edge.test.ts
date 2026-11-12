import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ cookie: "grocer.session=abc" as string | null }));
vi.mock("@sentry/react-native", () => ({
  captureException: vi.fn(),
  startInactiveSpan: () => ({ end: () => {} }),
  withActiveSpan: <T>(_span: unknown, fn: () => T) => fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { getCookie: async () => auth.cookie } }));

const fetchMock = vi.fn();
type Call = [string, RequestInit & { headers: Headers }];
const call = (i = 0) => fetchMock.mock.calls[i] as unknown as Call;

async function load(baseUrl?: string) {
  vi.resetModules();
  if (baseUrl === undefined) vi.stubEnv("EXPO_PUBLIC_API_URL", undefined as unknown as string);
  else vi.stubEnv("EXPO_PUBLIC_API_URL", baseUrl);
  return (await import("@/lib/api")).api;
}

beforeEach(() => {
  auth.cookie = "grocer.session=abc";
  fetchMock.mockReset().mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("base URL / path joining", () => {
  it.each([
    ["http://api.test", "/x", "http://api.test/x"],
    ["http://api.test/", "/x", "http://api.test/x"],
    ["http://api.test///", "x", "http://api.test/x"],
    ["http://api.test/", "///x/y", "http://api.test/x/y"],
    ["http://api.test:8080/v1/", "api/lists", "http://api.test:8080/v1/api/lists"],
  ])("base %s + path %s -> %s", async (base, path, expected) => {
    const api = await load(base);
    await api(path);
    expect(call()[0]).toBe(expected);
  });
  it("defaults to http://localhost:3000 when the env var is unset", async () => {
    const api = await load(undefined);
    await api("/p");
    expect(call()[0]).toBe("http://localhost:3000/p");
  });
  it("keeps the query string untouched", async () => {
    const api = await load("http://a.test/");
    await api("/products/search?q=milk&limit=5");
    expect(call()[0]).toBe("http://a.test/products/search?q=milk&limit=5");
  });
});

describe("headers", () => {
  it("sets Content-Type: application/json only when a body is present", async () => {
    const api = await load("http://a.test");
    await api("/get");
    await api("/post", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(call(0)[1].headers.get("Content-Type")).toBeNull();
    expect(call(1)[1].headers.get("Content-Type")).toBe("application/json");
  });
  it("does not override a caller-supplied Content-Type (any header casing / init shape)", async () => {
    const api = await load("http://a.test");
    await api("/u", { method: "POST", body: "x", headers: { "content-type": "text/plain" } });
    await api("/u", { method: "POST", body: "x", headers: new Headers({ "Content-Type": "text/csv" }) });
    expect(call(0)[1].headers.get("Content-Type")).toBe("text/plain");
    expect(call(1)[1].headers.get("Content-Type")).toBe("text/csv");
  });
  it("omits Cookie when getCookie() returns null or empty string", async () => {
    const api = await load("http://a.test");
    auth.cookie = null;
    await api("/a");
    auth.cookie = "";
    await api("/b");
    expect(call(0)[1].headers.has("Cookie")).toBe(false);
    expect(call(1)[1].headers.has("Cookie")).toBe(false);
  });
  it("sends the cookie and preserves other caller headers; credentials are 'omit'; method/body pass through", async () => {
    const api = await load("http://a.test");
    await api("/a", { method: "PATCH", body: "{}", headers: { "X-Trace": "1" } });
    const [, init] = call();
    expect(init.headers.get("Cookie")).toBe("grocer.session=abc");
    expect(init.headers.get("X-Trace")).toBe("1");
    expect(init.credentials).toBe("omit");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe("{}");
  });
});

describe("responses", () => {
  it("204 resolves to undefined without parsing a body", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    const api = await load("http://a.test");
    await expect(api("/d", { method: "DELETE" })).resolves.toBeUndefined();
  });
  it("200 parses JSON, including falsy payloads", async () => {
    const api = await load("http://a.test");
    fetchMock.mockImplementationOnce(async () => Response.json([]));
    fetchMock.mockImplementationOnce(async () => Response.json(0));
    expect(await api("/a")).toEqual([]);
    expect(await api("/b")).toBe(0);
  });
  it("error message includes method, path, status and response body", async () => {
    fetchMock.mockImplementation(async () => new Response('{"error":"nope"}', { status: 403 }));
    const api = await load("http://a.test");
    await expect(api("/lists/1", { method: "POST" })).rejects.toThrow('POST /lists/1 failed: 403 {"error":"nope"}');
  });
  it("defaults the method to GET in the error message", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 500 }));
    const api = await load("http://a.test");
    await expect(api("/boom")).rejects.toThrow(/^GET \/boom failed: 500/);
  });
  it("does not swallow network errors: they come back as a request that got no response", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    const api = await load("http://a.test");
    await expect(api("/x")).rejects.toThrow(/^GET \/x got no response: Network request failed/);
  });
  it("treats 3xx/4xx/5xx as errors but 201 as success", async () => {
    const api = await load("http://a.test");
    fetchMock.mockImplementationOnce(async () => Response.json({ id: "1" }, { status: 201 }));
    expect(await api("/c", { method: "POST", body: "{}" })).toEqual({ id: "1" });
    fetchMock.mockImplementationOnce(async () => new Response("bad", { status: 400 }));
    await expect(api("/c", { method: "POST", body: "{}" })).rejects.toThrow("400 bad");
  });
});
