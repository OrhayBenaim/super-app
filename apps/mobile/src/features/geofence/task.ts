// Imported from app/_layout.tsx: defineTask must run at module top level so a cold start (iOS relaunch on region enter) finds it.
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { t } from "@/lib/strings";
import { GEOFENCE_TASK } from "./regions";

/** storeId -> [store label, basket total]; written by syncGeofences, read in the background. */
export const STORES_KEY = "nearbyStores";
export type StoreInfo = Record<string, [string, number]>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

type GeofenceData = { eventType: Location.GeofencingEventType; region: Location.LocationRegion };

TaskManager.defineTask<GeofenceData>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || data.eventType !== Location.GeofencingEventType.Enter) return;
  const { identifier: storeId, latitude: lat, longitude: lng } = data.region;
  const info = (JSON.parse((await SecureStore.getItemAsync(STORES_KEY)) ?? "{}") as StoreInfo)[storeId ?? ""];
  if (!info) return;
  const [store, total] = info;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t("nearby.title").replace("{store}", store),
      body: t("nearby.body").replace("{total}", total.toFixed(2)),
      data: { storeId, lat, lng },
      categoryIdentifier: "nearby",
    },
    trigger: null,
  });
});
