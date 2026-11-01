import type { QueryClient } from "@tanstack/react-query";
import { disableNearbyAlerts } from "@/features/geofence/useNearbyAlerts";
import { authClient } from "@/lib/auth-client";

/** Account deletion. Clears the device only once the server has deleted the User. */
export async function deleteAccount(queryClient: QueryClient): Promise<"deleted" | "reauth" | "failed"> {
  const { error } = await authClient.deleteUser().catch(() => ({ error: { code: undefined } }));
  if (error) return error.code === "SESSION_EXPIRED" ? "reauth" : "failed";
  queryClient.clear();
  await disableNearbyAlerts().catch(() => {}); // the account is already gone; a stuck geofence must not report failure
  return "deleted";
}
