import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { fetchCompare } from "@/features/compare/api";
import { basketSize, type Basket } from "@/features/lists/api";
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
export async function syncGeofences(coords: Coords, basket: Basket) {
  if (!useEnabled.getState().enabled) return;
  if (!basketSize(basket)) return stop();
  const { stores } = await fetchCompare({ ...coords, radiusKm: 20, ...basket, sort: "price", limit: MAX_REGIONS });
  if (!stores.length) return stop();
  const info: StoreInfo = Object.fromEntries(stores.map((s) => [s.storeId, [`${s.chainName} ${s.storeName}`, s.total]]));
  await SecureStore.setItemAsync(STORES_KEY, JSON.stringify(info));
  await Location.startGeofencingAsync(GEOFENCE_TASK, toRegions(stores)); // replaces the previous set
  if (!useEnabled.getState().enabled) await disableNearbyAlerts(); // turned off while this sync ran: undo it
}

/** Turns nearby alerts off and leaves nothing of them on the phone. Safe when geofencing never started. */
export async function disableNearbyAlerts() {
  useEnabled.setState({ enabled: false }); // first, so a sync still in flight sees it and undoes its work
  // Every step runs even if another fails; the first failure is reported.
  const failed = (await Promise.allSettled([stop(), SecureStore.deleteItemAsync(STORES_KEY), SecureStore.setItemAsync(ENABLED_KEY, "0")])).find(
    (r) => r.status === "rejected",
  );
  if (failed) throw failed.reason;
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
