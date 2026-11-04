import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";

export type Coords = { lat: number; lng: number };
type State =
  | { status: "checking" | "locating" }
  | { status: "denied"; canAskAgain: boolean }
  | { status: "ready"; coords: Coords }
  | { status: "error"; error: string };

const toCoords = (l: Location.LocationObject): Coords => ({ lat: l.coords.latitude, lng: l.coords.longitude });

let pendingPrompt: Promise<Location.LocationPermissionResponse> | undefined;
/** Reads the foreground permission; if it was never answered, asks. Home is the first signed-in screen, so that's where the prompt shows. Concurrent callers share one prompt. */
export async function foregroundPermission() {
  const p = await Location.getForegroundPermissionsAsync();
  if (p.status !== Location.PermissionStatus.UNDETERMINED) return p;
  return (pendingPrompt ??= Location.requestForegroundPermissionsAsync().finally(() => (pendingPrompt = undefined)));
}

/** Foreground location: checks permission on mount (asking the first time), `request()` asks (or opens Settings when the OS won't ask again). */
export function useLocation() {
  const [state, setState] = useState<State>({ status: "checking" });

  const locate = useCallback(async () => {
    try {
      // Last known is instant; then refine with a fresh fix.
      const last = await Location.getLastKnownPositionAsync();
      if (last) setState({ status: "ready", coords: toCoords(last) });
      else setState({ status: "locating" });
      const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setState({ status: "ready", coords: toCoords(now) });
    } catch (e) {
      setState((s) => (s.status === "ready" ? s : { status: "error", error: String(e) }));
    }
  }, []);

  const handle = useCallback(
    (p: Location.LocationPermissionResponse) =>
      p.granted ? locate() : setState({ status: "denied", canAskAgain: p.canAskAgain }),
    [locate],
  );

  useEffect(() => {
    foregroundPermission().then(handle, (e) => setState({ status: "error", error: String(e) }));
  }, [handle]);

  const request = useCallback(async () => {
    if (state.status === "denied" && !state.canAskAgain) return Linking.openSettings();
    await handle(await Location.requestForegroundPermissionsAsync());
  }, [state, handle]);

  return { ...state, coords: state.status === "ready" ? state.coords : null, request, refresh: locate };
}

/** Foreground first (Android requires it), then "Always". */
export async function requestBackgroundPermission() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  return (await Location.requestBackgroundPermissionsAsync()).granted;
}
