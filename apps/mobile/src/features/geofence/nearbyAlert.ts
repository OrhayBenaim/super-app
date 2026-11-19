// The Nearby alert: entry points armNearbyAlerts, onFenceEntered, disableNearbyAlerts (+ saveBasket). Everything else is internal.
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { fetchCompare } from "@/features/compare/api";
import { fmt, formatDistance } from "@/features/compare/format";
import { basketSize, type Basket } from "@/features/lists/api";
import { Events, flush, track } from "@/lib/analytics";
import { currentFix, currentLocation } from "@/lib/location";
import { t } from "@/lib/strings";
import { GEOFENCE_TASK, MAX_REGIONS, MOVE_TASK, NEARBY_RADIUS_KM, toRegions } from "./regions";

export const ENABLED_KEY = "nearbyAlertsEnabled";
/** The current List's basket (what Compare prices), refreshed whenever the List loads; read in the background. */
export const BASKET_KEY = "nearbyBasket";
/** The local day of the last Nearby alert shown, across all stores. */
export const LAST_ALERT_KEY = "nearbyLastAlert";
const MAX_SPEED_KMH = 95;
/** How far around the position the 20 nearest stores are looked for. */
const FENCE_SEARCH_KM = 20;

export const useEnabled = create<{ enabled: boolean }>(() => ({ enabled: SecureStore.getItem(ENABLED_KEY) === "1" }));
const isEnabled = () => useEnabled.getState().enabled;

/** Moving 5 km re-arms the fences; low-power, deferred batches, never continuous GPS. */
const MOVE_KM = 5;

async function stopTask(started: () => Promise<boolean>, stopIt: () => Promise<void>) {
  if (await started().catch(() => false)) await stopIt();
}

/** Stops the fences and the location updates; both are tried, the first failure is reported. */
async function stop() {
  const failed = (
    await Promise.allSettled([
      stopTask(() => Location.hasStartedGeofencingAsync(GEOFENCE_TASK), () => Location.stopGeofencingAsync(GEOFENCE_TASK)),
      stopTask(() => Location.hasStartedLocationUpdatesAsync(MOVE_TASK), () => Location.stopLocationUpdatesAsync(MOVE_TASK)),
    ])
  ).find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}

async function startMoveUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(MOVE_TASK).catch(() => false)) return; // restarting would fire an update at once: a loop
  await Location.startLocationUpdatesAsync(MOVE_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: MOVE_KM * 1000,
    deferredUpdatesDistance: MOVE_KM * 1000,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.Other,
  });
}

async function readBasket(): Promise<Basket> {
  try {
    const b = JSON.parse((await SecureStore.getItemAsync(BASKET_KEY)) ?? "") as Basket;
    return { items: b.items ?? [], groups: b.groups ?? [] };
  } catch {
    return { items: [], groups: [] };
  }
}

/** Keeps the phone's copy of the basket current. Does nothing while alerts are off, so nothing is left behind. */
export async function saveBasket(basket: Basket) {
  if (isEnabled()) await SecureStore.setItemAsync(BASKET_KEY, JSON.stringify(basket));
}

/** Fences the 20 nearest stores around the current position at 2 km each (replacing the old set); stops everything for an empty basket. */
export async function armNearbyAlerts() {
  if (!isEnabled()) return;
  const basket = await readBasket();
  if (!basketSize(basket)) return stop();
  const here = await currentLocation();
  if (!here) return; // no fix: keep the fences we have
  const { stores } = await fetchCompare({ ...here, radiusKm: FENCE_SEARCH_KM, ...basket, sort: "distance", limit: MAX_REGIONS });
  if (!stores.length) return stop();
  await Location.startGeofencingAsync(GEOFENCE_TASK, toRegions(stores));
  if (isEnabled()) await startMoveUpdates();
  if (!isEnabled()) await disableNearbyAlerts(); // turned off while this ran: undo it
}

const dayOf = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Local night (22:00-07:00) or Shabbat (Friday 15:00 to Sunday 09:00). */
function quietTime(d: Date) {
  const h = d.getHours();
  const day = d.getDay();
  return h >= 22 || h < 7 || (day === 5 && h >= 15) || day === 6 || (day === 0 && h < 9);
}

/** A fence was entered: alert for the cheapest store within 2 km of a fresh fix, once a day, not at night, on Shabbat or above 95 km/h.
 *  Any stop (limit, no basket, fix, network, price) is silent and leaves the day's alert unused. */
export async function onFenceEntered() {
  if (!isEnabled()) return;
  const now = new Date();
  if (quietTime(now) || (await SecureStore.getItemAsync(LAST_ALERT_KEY)) === dayOf(now)) return;
  const basket = await readBasket();
  if (!basketSize(basket)) return;
  const fix = await currentFix();
  if (!fix || (fix.speedKmh ?? 0) > MAX_SPEED_KMH) return;
  const here = { lat: fix.lat, lng: fix.lng };
  const res = await fetchCompare({ ...here, radiusKm: NEARBY_RADIUS_KM, ...basket, sort: "price", limit: 1 }).catch(() => null);
  const store = res?.stores[0];
  if (!store || !store.matched) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: fmt(t("nearby.title"), { store: `${store.chainName} ${store.storeName}` }),
      body: fmt(t("nearby.body"), { total: store.total.toFixed(2), distance: formatDistance(store.distanceKm, t) }),
      data: { storeId: store.storeId, lat: store.lat, lng: store.lng },
      categoryIdentifier: "nearby",
    },
    trigger: null,
  });
  await SecureStore.setItemAsync(LAST_ALERT_KEY, dayOf(now));
  track(Events.geofenceTriggered, { storeId: store.storeId });
  await flush().catch(() => {}); // the OS may suspend the app as soon as the task returns
}

/** Turns nearby alerts off and leaves nothing of them on the phone. Safe when geofencing never started. */
export async function disableNearbyAlerts() {
  useEnabled.setState({ enabled: false }); // first, so an arm still in flight sees it and undoes its work
  // Every step runs even if another fails; the first failure is reported.
  const failed = (await Promise.allSettled([stop(), SecureStore.deleteItemAsync(BASKET_KEY), SecureStore.deleteItemAsync(LAST_ALERT_KEY), SecureStore.setItemAsync(ENABLED_KEY, "0")])).find(
    (r) => r.status === "rejected",
  );
  if (failed) throw failed.reason;
}
