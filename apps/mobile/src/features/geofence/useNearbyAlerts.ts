import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { fetchCompare } from "@/features/compare/api";
import { requestBackgroundPermission, type Coords } from "@/lib/location";
import { GEOFENCE_TASK, MAX_REGIONS, toRegions } from "./regions";
import { STORES_KEY, type StoreInfo } from "./task";

const ENABLED_KEY = "nearbyAlertsEnabled";
/** Background location is unavailable in Expo Go. */
export const nearbyAlertsSupported = Constants.appOwnership !== "expo";

const useEnabled = create<{ enabled: boolean }>(() => ({ enabled: SecureStore.getItem(ENABLED_KEY) === "1" }));

async function stop() {
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
}

/** Arms geofences on the cheapest nearby stores for the basket; stops them when the basket is empty. */
export async function syncGeofences(coords: Coords, codes: string[]) {
  if (!useEnabled.getState().enabled) return;
  if (!codes.length) return stop();
  const { stores } = await fetchCompare({ ...coords, radiusKm: 20, codes, sort: "price", limit: MAX_REGIONS });
  if (!stores.length) return stop();
  const info: StoreInfo = Object.fromEntries(stores.map((s) => [s.storeId, [`${s.chainName} ${s.storeName}`, s.total]]));
  await SecureStore.setItemAsync(STORES_KEY, JSON.stringify(info));
  await Location.startGeofencingAsync(GEOFENCE_TASK, toRegions(stores)); // replaces the previous set
}

export function useNearbyAlerts() {
  const enabled = useEnabled((s) => s.enabled);

  /** Returns false when a permission was refused (the switch stays off). */
  const setEnabled = async (on: boolean) => {
    if (on) {
      if (!(await requestBackgroundPermission())) return false;
      if (!(await Notifications.requestPermissionsAsync()).granted) return false;
    } else {
      await stop();
    }
    await SecureStore.setItemAsync(ENABLED_KEY, on ? "1" : "0");
    useEnabled.setState({ enabled: on });
    return true;
  };

  return { enabled, setEnabled, syncGeofences, supported: nearbyAlertsSupported };
}
