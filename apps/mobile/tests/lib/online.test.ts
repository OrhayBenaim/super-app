import { focusManager, onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

type Listener<T> = (v: T) => void;
const net: { cb?: Listener<{ isConnected: boolean | null; isInternetReachable: boolean | null }>; unsubscribed: boolean } = { unsubscribed: false };
const app: { cb?: Listener<string> } = {};
vi.mock("@react-native-community/netinfo", () => ({
  default: { addEventListener: (cb: never) => ((net.cb = cb), () => (net.unsubscribed = true)) },
}));
vi.mock("react-native", () => ({ AppState: { addEventListener: (_: string, cb: never) => ((app.cb = cb), { remove: () => {} }) } }));

import { connectQueryManagers } from "@/lib/online";

describe("connectQueryManagers", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    focusManager.setFocused(undefined);
  });

  it("follows the phone's connection: offline when not connected or the internet is unreachable, online otherwise", () => {
    connectQueryManagers();
    const stop = onlineManager.subscribe(() => {});
    net.cb!({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    net.cb!({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false); // a network with no internet
    net.cb!({ isConnected: true, isInternetReachable: null });
    expect(onlineManager.isOnline()).toBe(true); // not known yet: trust the connection
    net.cb!({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    stop();
  });

  it("is focused while the app is active, and not in the background", () => {
    connectQueryManagers();
    const stop = focusManager.subscribe(() => {});
    app.cb!("background");
    expect(focusManager.isFocused()).toBe(false);
    app.cb!("active");
    expect(focusManager.isFocused()).toBe(true);
    stop();
  });
});
