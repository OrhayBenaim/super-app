import { beforeEach, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ identify: vi.fn(), reset: vi.fn(), capture: vi.fn(), screen: vi.fn(), options: undefined as unknown }));
vi.mock("posthog-react-native", () => ({
  PostHog: class {
    constructor(_key: string, options: unknown) {
      client.options = options;
      return client;
    }
  },
}));

vi.stubEnv("EXPO_PUBLIC_POSTHOG_KEY", "phc_test");
const { screenName, syncIdentity } = await import("@/lib/analytics");

beforeEach(() => vi.clearAllMocks());

it("creates no client without EXPO_PUBLIC_POSTHOG_KEY, and every call is a no-op", async () => {
  vi.stubEnv("EXPO_PUBLIC_POSTHOG_KEY", "");
  vi.resetModules();
  client.options = undefined;
  const analytics = await import("@/lib/analytics");
  expect(client.options).toBeUndefined();
  analytics.track(analytics.Events.tap);
  analytics.screen("/");
  analytics.syncIdentity(null, "u1");
  await expect(analytics.flush()).resolves.toBeUndefined();
  expect(client.capture).not.toHaveBeenCalled();
  expect(client.identify).not.toHaveBeenCalled();
});

it("identifies on sign-in and resets on sign-out", () => {
  syncIdentity(null, "u1");
  expect(client.identify).toHaveBeenCalledWith("u1");
  expect(client.reset).not.toHaveBeenCalled();

  syncIdentity("u1", null);
  expect(client.reset).toHaveBeenCalledOnce();
  expect(client.identify).toHaveBeenCalledOnce();
});

it("does nothing when the user is unchanged, resets before identifying a different user", () => {
  syncIdentity(null, null);
  syncIdentity("u1", "u1");
  expect(client.identify).not.toHaveBeenCalled();
  expect(client.reset).not.toHaveBeenCalled();

  syncIdentity("u1", "u2");
  expect(client.reset.mock.invocationCallOrder[0]).toBeLessThan(client.identify.mock.invocationCallOrder[0]!);
  expect(client.identify).toHaveBeenCalledWith("u2");
});

it("names screens by route pattern, without groups or param values", () => {
  expect(screenName(["(tabs)"])).toBe("/");
  expect(screenName(["(tabs)", "compare"])).toBe("/compare");
  expect(screenName(["join", "[code]"])).toBe("/join/[code]");
  expect(screenName(["(auth)", "sign-in"])).toBe("/sign-in");
});
