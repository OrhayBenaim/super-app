import type { QueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { wipeDevice } from "@/features/lists/saved";

/**
 * Sign out, then clear what this User left on the phone: the next person to sign in never sees their List. A failed
 * sign-out (offline) leaves the User signed in, so their queued edits stay; a different User signing in wipes them anyway.
 */
export async function signOut(queryClient: QueryClient) {
  const { error } = await authClient.signOut();
  if (!error) await wipeDevice(queryClient);
}
