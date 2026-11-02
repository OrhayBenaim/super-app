import { vi } from "vitest";

// posthog-react-native imports React Native, which can't load in Node; modules that track events get a no-op client.
vi.mock("posthog-react-native", () => ({
  PostHog: class {
    capture() {}
    identify() {}
    reset() {}
    screen() {}
    flush = async () => {};
  },
}));
