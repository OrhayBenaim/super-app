// Feeds TanStack Query what it cannot see by itself on React Native: the phone's connection and whether the app is in front.
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

/**
 * Online follows NetInfo (offline edits pause on it); focus follows AppState (the List refetches when the app comes back to the front).
 * Call once at startup. `isInternetReachable` is null until NetInfo knows: then the connection alone decides.
 */
export function connectQueryManagers() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)),
  );
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener("change", (s) => setFocused(s === "active"));
    return () => sub.remove();
  });
}

/** Whether the phone is online, live: the screens' offline line reads this. */
export const useIsOnline = () => useSyncExternalStore(onlineManager.subscribe, () => onlineManager.isOnline());
