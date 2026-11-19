// Imported from app/_layout.tsx: defineTask must run at module top level so a cold start (iOS relaunch on region enter) finds it.
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { armNearbyAlerts, onFenceEntered } from "./nearbyAlert";
import { GEOFENCE_TASK, MOVE_TASK } from "./regions";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

TaskManager.defineTask<{ eventType: Location.GeofencingEventType }>(GEOFENCE_TASK, async ({ data, error }) => {
  if (!error && data.eventType === Location.GeofencingEventType.Enter) await onFenceEntered();
});

TaskManager.defineTask(MOVE_TASK, async ({ error }) => {
  if (!error) await armNearbyAlerts().catch(() => {}); // a failed re-arm keeps the old fences; the next 5 km tries again
});
