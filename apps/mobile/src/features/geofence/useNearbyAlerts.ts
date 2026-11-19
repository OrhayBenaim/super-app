import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";
import { missingBasket, useCurrentListId, useList } from "@/features/lists/api";
import { requestBackgroundPermission } from "@/lib/location";
import { armNearbyAlerts, disableNearbyAlerts, ENABLED_KEY, saveBasket, useEnabled } from "./nearbyAlert";

/** Background location is unavailable in Expo Go. */
export const nearbyAlertsSupported = Constants.appOwnership !== "expo";

/** Signed-in, always mounted: keeps the basket copy current and arms once per start or switch-on. Best-effort. */
export function useNearbyAlertsSync() {
  const enabled = useEnabled((s) => s.enabled);
  const list = useList(useCurrentListId(), { poll: false });
  const armed = useRef(false);
  useEffect(() => {
    if (!enabled) {
      armed.current = false;
      return;
    }
    if (!list.data) return;
    const sync = async () => {
      await saveBasket(missingBasket(list.data));
      if (armed.current) return;
      await armNearbyAlerts();
      armed.current = true; // only after a successful arm: a failed one is retried on the next List load
    };
    sync().catch(() => {});
  }, [enabled, list.data]);
}

export function useNearbyAlerts() {
  const enabled = useEnabled((s) => s.enabled);

  /** Returns false when a permission was refused (the switch stays off). */
  const setEnabled = async (on: boolean) => {
    if (!on) {
      await disableNearbyAlerts();
      return true;
    }
    if (!(await requestBackgroundPermission())) return false;
    if (!(await Notifications.requestPermissionsAsync()).granted) return false;
    await SecureStore.setItemAsync(ENABLED_KEY, "1");
    useEnabled.setState({ enabled: true });
    return true;
  };

  return { enabled, setEnabled, supported: nearbyAlertsSupported };
}
