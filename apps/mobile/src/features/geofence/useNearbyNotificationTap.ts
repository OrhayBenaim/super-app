import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { openWaze } from "@/lib/waze";

function handle(response: Notifications.NotificationResponse | null) {
  const { lat, lng } = (response?.notification.request.content.data ?? {}) as { lat?: unknown; lng?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number") return;
  Notifications.clearLastNotificationResponse(); // don't replay it on the next sign-in or remount
  void openWaze(lat, lng);
  router.replace("/(tabs)"); // back in the app later, the shopping list is waiting
}

/** Nearby-alert tap: navigate there in Waze. Covers cold start (last response) and taps while running. */
export function useNearbyNotificationTap(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    handle(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [ready]);
}
