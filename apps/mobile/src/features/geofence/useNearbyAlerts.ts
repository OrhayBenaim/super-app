import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { missingBasket, useCurrentListId, useList } from "@/features/lists/api";
import { requestBackgroundPermission } from "@/lib/location";
import { disableNearbyAlerts, enableNearbyAlerts, listLoaded, useEnabled } from "./nearbyAlert";

/** Background location is unavailable in Expo Go. */
export const nearbyAlertsSupported = Constants.appOwnership !== "expo";

/** Signed-in, always mounted: hands every List load (and a switch-on) to the Nearby alert. Best-effort. */
export function useNearbyAlertsSync() {
  const enabled = useEnabled((s) => s.enabled);
  const list = useList(useCurrentListId(), { poll: false });
  useEffect(() => {
    if (enabled && list.data) listLoaded(missingBasket(list.data)).catch(() => {});
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
    await enableNearbyAlerts();
    return true;
  };

  return { enabled, setEnabled, supported: nearbyAlertsSupported };
}
